# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-26

### Added
- **Frontend**: Drag & Drop reordering for reward campaigns.
- **Frontend**: Keyboard accessibility and navigation improvements for the user dashboard.
- **Frontend**: Help & FAQ section with searchable content.
- **Infrastructure**: Prometheus metrics collection and Grafana dashboards for monitoring.
- **Infrastructure**: Kubernetes manifests for production deployment.
- **Infrastructure**: Blue-Green deployment strategy via GitHub Actions.
- **Security**: Integration with AWS Secrets Manager for backend sensitive data.
- **Security**: Automated secrets rotation for database credentials.
- **Documentation**: Comprehensive contributing guide (`CONTRIBUTING.md`).
- **Performance**: CDN configuration for static asset delivery.
- **Feature**: User transaction history page with Stellar Explorer links.

### Fixed
- Fixed token overflow guards in reward claiming logic.
- Resolved race condition in the event indexer during high ledger volume.
- Corrected display issues for expired campaigns on mobile devices.
