# Contributing to KAMI

Thanks for your interest! Bug reports, fixes, docs and features are all welcome.

- **Set up locally:** [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- **How the code is organised and how to add things:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Quick workflow

1. Open an issue first for anything non-trivial so we can agree on direction.
2. Fork, then branch from `master`.
3. Make a focused change and add or update tests in `tests/`.
4. Make sure the checks CI runs pass locally:
   ```bash
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
   ```
5. Open a pull request describing the change and why.

Please never commit `.env` files, API keys, or real user data. Security vulnerabilities should be reported privately — see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
