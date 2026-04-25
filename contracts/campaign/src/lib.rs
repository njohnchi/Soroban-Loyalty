#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Campaign {
    pub id: u64,
    pub merchant: Address,
    pub reward_amount: i128,
    pub expiration: u64, // Unix timestamp (seconds)
    pub active: bool,
    pub total_claimed: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct UpgradeProposal {
    pub wasm_hash: soroban_sdk::BytesN<32>,
    pub proposed_at: u64,
    pub signatures: soroban_sdk::Vec<Address>,
}

#[contracttype]
pub enum DataKey {
    Campaign(u64),
    NextId,
    Admins,
    Threshold,
    UpgradeProposal,
}

// ── Events ────────────────────────────────────────────────────────────────────

const CAMPAIGN_CREATED: Symbol = symbol_short!("CAM_CRT");
const CAMPAIGN_UPDATED: Symbol = symbol_short!("CAM_UPD");
const UPGRADE_PROPOSED: Symbol = symbol_short!("UPG_PROP");
const UPGRADE_AUTHORIZED: Symbol = symbol_short!("UPG_AUTH");
const UPGRADE_EXECUTED: Symbol = symbol_short!("UPG_EXEC");
const UPGRADE_CANCELLED: Symbol = symbol_short!("UPG_CAN");

const TIMELOCK: u64 = 172_800; // 48 hours in seconds

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CampaignContract;

#[contractimpl]
impl CampaignContract {
    pub fn initialize(env: Env, admins: soroban_sdk::Vec<Address>, threshold: u32) {
        if env.storage().instance().has(&DataKey::Admins) {
            panic!("already initialized");
        }
        assert!(threshold > 0, "threshold must be positive");
        assert!(admins.len() >= threshold, "insufficient admins for threshold");

        env.storage().instance().set(&DataKey::Admins, &admins);
        env.storage().instance().set(&DataKey::Threshold, &threshold);
        env.storage().instance().set(&DataKey::NextId, &1_u64);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn next_id(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1)
    }

    fn bump_id(env: &Env) -> u64 {
        let id = Self::next_id(env);
        env.storage()
            .instance()
            .set(&DataKey::NextId, &(id + 1));
        id
    }

    // ── Public interface ──────────────────────────────────────────────────────

    /// Create a new campaign. Only the merchant (caller) can create it.
    pub fn create_campaign(
        env: Env,
        merchant: Address,
        reward_amount: i128,
        expiration: u64,
    ) -> u64 {
        merchant.require_auth();
        assert!(reward_amount > 0, "reward_amount must be positive");
        assert!(
            expiration > env.ledger().timestamp(),
            "expiration must be in the future"
        );

        let id = Self::bump_id(&env);
        let campaign = Campaign {
            id,
            merchant: merchant.clone(),
            reward_amount,
            expiration,
            active: true,
            total_claimed: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(id), &campaign);

        env.events()
            .publish((CAMPAIGN_CREATED, symbol_short!("id"), id), merchant);

        id
    }

    /// Deactivate / reactivate a campaign. Only the merchant can do this.
    pub fn set_active(env: Env, campaign_id: u64, active: bool) {
        let mut campaign = Self::get_campaign_internal(&env, campaign_id);
        campaign.merchant.require_auth();
        campaign.active = active;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        env.events()
            .publish((CAMPAIGN_UPDATED, symbol_short!("id"), campaign_id), active);
    }

    /// Called by the rewards contract to increment the claim counter.
    pub fn record_claim(env: Env, campaign_id: u64) {
        let mut campaign = Self::get_campaign_internal(&env, campaign_id);
        campaign.total_claimed = campaign
            .total_claimed
            .checked_add(1)
            .expect("overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);
    }

    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        Self::get_campaign_internal(&env, campaign_id)
    }

    fn get_campaign_internal(env: &Env, campaign_id: u64) -> Campaign {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("campaign not found")
    }

    pub fn is_active(env: Env, campaign_id: u64) -> bool {
        let c = Self::get_campaign_internal(&env, campaign_id);
        c.active && env.ledger().timestamp() < c.expiration
    }

    // ── Upgrade Mechanism ───────────────────────────────────────────────────

    pub fn propose_upgrade(env: Env, admin: Address, wasm_hash: soroban_sdk::BytesN<32>) {
        Self::require_admin(&env, &admin);
        if env.storage().instance().has(&DataKey::UpgradeProposal) {
            panic!("upgrade already proposed");
        }

        let mut signatures = soroban_sdk::Vec::new(&env);
        signatures.push_back(admin.clone());

        let proposal = UpgradeProposal {
            wasm_hash: wasm_hash.clone(),
            proposed_at: env.ledger().timestamp(),
            signatures,
        };

        env.storage().instance().set(&DataKey::UpgradeProposal, &proposal);
        env.events().publish((UPGRADE_PROPOSED, wasm_hash), admin);
    }

    pub fn authorize_upgrade(env: Env, admin: Address) {
        Self::require_admin(&env, &admin);
        let mut proposal: UpgradeProposal = env
            .storage()
            .instance()
            .get(&DataKey::UpgradeProposal)
            .expect("no pending proposal");

        for signee in proposal.signatures.iter() {
            if signee == admin {
                panic!("already authorized by this admin");
            }
        }

        proposal.signatures.push_back(admin.clone());
        env.storage().instance().set(&DataKey::UpgradeProposal, &proposal);
        env.events().publish(UPGRADE_AUTHORIZED, admin);
    }

    pub fn execute_upgrade(env: Env, admin: Address) {
        Self::require_admin(&env, &admin);
        let proposal: UpgradeProposal = env
            .storage()
            .instance()
            .get(&DataKey::UpgradeProposal)
            .expect("no pending proposal");

        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        assert!(
            proposal.signatures.len() >= threshold,
            "insufficient authorizations"
        );
        assert!(
            env.ledger().timestamp() >= proposal.proposed_at + TIMELOCK,
            "timelock not met"
        );

        env.deployer().update_current_contract_wasm(proposal.wasm_hash.clone());
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.events().publish(UPGRADE_EXECUTED, proposal.wasm_hash);
    }

    pub fn cancel_upgrade(env: Env, admin: Address) {
        Self::require_admin(&env, &admin);
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.events().publish(UPGRADE_CANCELLED, admin);
    }

    fn require_admin(env: &Env, admin: &Address) {
        admin.require_auth();
        let admins: soroban_sdk::Vec<Address> = env.storage().instance().get(&DataKey::Admins).unwrap();
        let mut is_admin = false;
        for a in admins.iter() {
            if a == *admin {
                is_admin = true;
                break;
            }
        }
        if !is_admin {
            panic!("not an admin");
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Env};

    fn setup() -> (Env, Address, Address, CampaignContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin1 = Address::generate(&env);
        let admin2 = Address::generate(&env);
        let contract_id = env.register_contract(None, CampaignContract);
        let client = CampaignContractClient::new(&env, &contract_id);
        let mut admins = soroban_sdk::Vec::new(&env);
        admins.push_back(admin1.clone());
        admins.push_back(admin2.clone());
        client.initialize(&admins, &2);
        (env, admin1, admin2, client)
    }

    #[test]
    fn test_create_campaign() {
        let (env, admin1, _admin2, client) = setup();
        let merchant = Address::generate(&env);
        let expiry = env.ledger().timestamp() + 86400;
        let id = client.create_campaign(&merchant, &100, &expiry);
        assert_eq!(id, 1);
        let c = client.get_campaign(&id);
        assert_eq!(c.merchant, merchant);
        assert_eq!(c.reward_amount, 100);
        assert!(c.active);
    }

    #[test]
    #[should_panic(expected = "expiration must be in the future")]
    fn test_expired_campaign_rejected() {
        let (env, admin1, _admin2, client) = setup();
        let merchant = Address::generate(&env);
        // expiration in the past
        client.create_campaign(&merchant, &100, &0);
    }

    #[test]
    fn test_set_active() {
        let (env, admin1, _admin2, client) = setup();
        let merchant = Address::generate(&env);
        let expiry = env.ledger().timestamp() + 86400;
        let id = client.create_campaign(&merchant, &100, &expiry);
        client.set_active(&id, &false);
        assert!(!client.get_campaign(&id).active);
    }

    #[test]
    fn test_is_active_after_expiry() {
        let (env, admin1, _admin2, client) = setup();
        let merchant = Address::generate(&env);
        let expiry = env.ledger().timestamp() + 10;
        let id = client.create_campaign(&merchant, &100, &expiry);
        assert!(client.is_active(&id));

        // advance ledger past expiry
        env.ledger().with_mut(|l| l.timestamp = expiry + 1);
        assert!(!client.is_active(&id));
    }

    #[test]
    fn test_upgrade_flow() {
        let (env, admin1, admin2, client) = setup();
        let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        // Propose
        client.propose_upgrade(&admin1, &wasm_hash);

        // Authorize (need 2nd signature for threshold 2)
        client.authorize_upgrade(&admin2);

        // Advance time for timelock (48h)
        env.ledger().with_mut(|l| l.timestamp += TIMELOCK + 1);

        // Execute
        client.execute_upgrade(&admin1);
    }

    #[test]
    #[should_panic(expected = "timelock not met")]
    fn test_upgrade_timelock_enforced() {
        let (env, admin1, admin2, client) = setup();
        let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        client.propose_upgrade(&admin1, &wasm_hash);
        client.authorize_upgrade(&admin2);

        // Try to execute before 48h
        client.execute_upgrade(&admin1);
    }

    #[test]
    #[should_panic(expected = "insufficient authorizations")]
    fn test_upgrade_threshold_enforced() {
        let (env, admin1, admin2, client) = setup();
        let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        client.propose_upgrade(&admin1, &wasm_hash);
        // missing 2nd signature

        env.ledger().with_mut(|l| l.timestamp += TIMELOCK + 1);
        client.execute_upgrade(&admin1);
    }

    #[test]
    fn test_cancel_upgrade() {
        let (env, admin1, _admin2, client) = setup();
        let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        client.propose_upgrade(&admin1, &wasm_hash);
        client.cancel_upgrade(&admin1);

        // Verify it's gone (should be able to propose again)
        client.propose_upgrade(&admin1, &wasm_hash);
    }
}
