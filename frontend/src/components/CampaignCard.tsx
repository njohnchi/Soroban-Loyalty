"use client";

import { Campaign } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import Image from "next/image";

interface Props {
  campaign: Campaign;
  onClaim?: (id: number) => void;
  claiming?: boolean;
  optimisticClaimed?: boolean;
}

export function CampaignCard({ campaign, onClaim, claiming }: Props) {
  const { t } = useI18n();
  const expired = Date.now() / 1000 > campaign.expiration;
  const statusKey = !campaign.active ? "inactive" : expired ? "expired" : "active";
  const status = t(`campaigns.status.${statusKey}`);
  const canClaim = campaign.active && !expired;

  const secondsLeft = campaign.expiration - now;
  const daysLeft = Math.floor(secondsLeft / 86400);
  const hoursLeft = Math.floor((secondsLeft % 86400) / 3600);

  let urgency: "low" | "medium" | "high" | "expired" = "low";
  if (expired) urgency = "expired";
  else if (daysLeft < 1) urgency = "high";
  else if (daysLeft < 3) urgency = "medium";

  const expiryText = expired
    ? "Expired"
    : daysLeft > 0
    ? `${daysLeft}d ${hoursLeft}h left`
    : `${hoursLeft}h left`;

  return (
    <div className="card" style={{ position: "relative" }}>
      <Confetti active={!!justClaimed} />
      <div className="card-image" style={{ width: '100%', height: '160px', position: 'relative', background: 'var(--bg-input)' }}>
        {campaign.image_url ? (
          <Image 
            src={campaign.image_url} 
            alt={`Campaign #${campaign.id}`} 
            fill 
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '2rem' }}>
            🎁
          </div>
        )}
      </div>
      <div className="card-header">
        <span className="badge" data-status={statusKey}>
          {status}
        </span>
        <span className="campaign-id">{t('campaigns.details.campaign')} #{campaign.id}</span>
      </div>
      <div className="card-body">
        <p>
          <strong>{t('campaigns.details.merchant')}:</strong>{" "}
          <span className="mono">
            {campaign.merchant.slice(0, 8)}…{campaign.merchant.slice(-4)}
          </span>
        </p>
        <p>
          <strong>{t('campaigns.details.reward')}:</strong> {campaign.reward_amount.toLocaleString()} LYT
        </p>
        <p>
          <strong>{t('campaigns.details.claimed')}:</strong> {campaign.total_claimed}
        </p>
        <p>
          <strong>{t('campaigns.details.expires')}:</strong>{" "}
          {new Date(campaign.expiration * 1000).toLocaleString()}
        </p>
      </div>
      {onClaim && (
        <div className="card-footer">
          <button
            onClick={() => onClaim(campaign.id)}
            disabled={!canClaim || claiming}
            className="btn btn-primary"
          >
            {claiming ? t('campaigns.actions.claiming') : t('campaigns.actions.claim')}
          </button>
        </div>
      )}
    </div>
  );
}
