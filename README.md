<a name="readme-top"></a>

<br />

<div align="center">

  <a href="https://github.com/LightDestory/CapyHome">
    <img src="https://raw.githubusercontent.com/LightDestory/CapyHome/master/.github/assets/images/presentation_image.png" alt="CapyHome capybara mascot" width="220">
  </a>

  <h2 align="center">CapyHome</h2>

  <p align="center">
    A private household tracker for cleaning, waste collection, and shared expenses.
  </p>

  <br />

</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#book-about-the-project">📖 About The Project</a></li>
    <li>
      <a href="#gear-getting-started">⚙️ Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#usage">Usage</a></li>
        <li><a href="#notes">Notes</a></li>
      </ul>
    </li>
    <li><a href="#dizzy-contributing">💫 Contributing</a></li>
    <li><a href="#handshake-support">🤝 Support</a></li>
    <li><a href="#warning-license">⚠️ License</a></li>
    <li><a href="#hammer_and_wrench-built-with">🛠️ Built With</a></li>
  </ol>
</details>

## :book: About The Project

CapyHome helps the people in one home coordinate recurring chores and shared costs. It combines a mobile-first browser interface with a small self-hosted server and a persistent SQLite database. The application is designed for one trusted household and one running server instance.

The main features are:

- A shared dashboard with the common-fund balance, activity totals, rooms, today's waste collections, and recent household activity.
- Cleaning records for one or more rooms, including the person, date, and optional notes.
- A weekly waste-collection schedule and a log of completed collections.
- A common fund with contributions, expenses, exact cent-based calculations, and protection against overspending.
- Paginated fund, cleaning, and waste histories, with selectable page sizes.
- Administrator tools for approving housemates and managing the house, rooms, and waste schedule.
- Italian and English interfaces, localized API messages, keyboard navigation, and accessible status messages.
- Responsive layouts for mobile and desktop, accompanied by a rotating capybara mascot.

Activities and fund transactions are permanent records in the current interface: they cannot be edited or deleted after submission. Removing a room or waste type archives it while preserving its history.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## :gear: Getting Started

CapyHome can run directly with Node.js or Bun, or as a single Docker Compose service. There is no frontend build step: Express serves the HTML, CSS, JavaScript, locale catalogs, and images directly from `public/`.

Before the first start, create an environment file and choose unique administrator credentials. The first successful startup creates the database and administrator. Later startups preserve the existing account and data.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Prerequisites

Choose one local runtime:

- [Node.js](https://nodejs.org/) 24 or newer.
- [Bun](https://bun.sh/) 1.3 or newer.

For container deployment, install [Docker](https://www.docker.com/) with Docker Compose.

The project uses the native `sqlite3` package. Do not disable dependency installation scripts. If a prebuilt binary is unavailable for your platform, the installation may also require a C/C++ toolchain and the build tools expected by `node-gyp`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Installation

1. Clone the repository and enter its directory:

   ```sh
   git clone https://github.com/LightDestory/CapyHome.git
   cd CapyHome
   ```

2. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

   On PowerShell, use `Copy-Item .env.example .env`.

3. Edit `.env`. Replace `ADMIN_PASSWORD` with a unique password between 10 and 128 characters. The example password is deliberately rejected. `ADMIN_USERNAME` is also required on the first startup.

4. Install dependencies with Bun:

   ```sh
   bun install --frozen-lockfile
   ```

   Alternatively, install with Node.js and npm:

   ```sh
   npm install
   ```

5. Start the application:

   ```sh
   bun run start:bun
   ```

   Or with Node.js:

   ```sh
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) and sign in with the administrator credentials from `.env`.

For automatic server restarts during development, use `bun run dev:bun` or `npm run dev`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Usage

After signing in for the first time:

1. Open **The house** and set the household name, address, and location.
2. Add the rooms that housemates can select when recording cleaning.
3. Open **Configure collection** and add each waste type with its weekly collection days.
4. Ask housemates to register. Their accounts remain pending until an administrator approves them.
5. Record cleaning, completed waste collections, contributions, and expenses from their respective pages.

The language selector is available on the authentication screen and in the application header. The browser stores the selection locally under `capyhome.language`; it is not attached to the user account. Dates, weekday names, and currency formatting follow the selected language, while household-entered names and notes remain unchanged.

#### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP port. In Compose, this controls the published host port. |
| `DATABASE_PATH` | `./data/capyhome.sqlite` | SQLite database path. Compose fixes it inside the persistent volume. |
| `ADMIN_NAME` | `Amministratore` | Display name for the first administrator. Compose defaults this to `Admin`. |
| `ADMIN_USERNAME` | None | Required username for the first administrator; 1–254 characters without whitespace. |
| `ADMIN_PASSWORD` | None | Required initial password; 10–128 characters. |
| `TZ` | `Europe/Rome` | IANA time zone used for household dates and today's schedule. |
| `COOKIE_SECURE` | `false` | Set to `true` when the public site uses HTTPS. |
| `TRUST_PROXY` | `0` | Set to `1` only behind exactly one trusted reverse proxy. |

Changing the administrator variables does not rename or reset an administrator after the database has been initialized.

#### Docker Compose

The Dockerfile installs dependencies with `npm ci`, so ensure `package-lock.json` exists before building. If it is absent, generate it with `npm install`.

```sh
docker compose up --build -d
docker compose logs -f capyhome
```

Compose publishes the application on `PORT`, stores the database in the `capyhome-data` volume, runs the container without root privileges, and checks `/api/health` for service health.

Stop the service without deleting its data:

```sh
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the household database.

#### Tests

Run the complete Node.js test suite with:

```sh
npm test
```

Or use Bun:

```sh
bun run test:bun
```

The tests use temporary databases and ephemeral HTTP ports. They do not access the configured household database.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Notes

#### Data and backups

Sequelize creates the schema with `sync()` when a new database starts. The project does not use migrations, `force`, or `alter`, and does not promise compatibility with older database schemas.

For a consistent backup, stop CapyHome and copy the complete data directory or Docker volume, including any `-wal` and `-shm` files. Restore the files while the service is stopped, preserve their permissions, and then restart the application. Backups contain household data and active sessions, so protect them like the original database.

#### Security and deployment

- New registrations require administrator approval. Rejected and pending users cannot access household data.
- The last approved administrator cannot be demoted or rejected.
- Passwords use scrypt with random salts. Session tokens are stored as hashes and sent through HttpOnly, SameSite cookies.
- Mutating API requests require JSON bodies and a CSRF token. Administrative endpoints require the administrator role.
- Authentication rate limits are stored in memory and reset when the server restarts.
- Internet-facing deployments should use an HTTPS reverse proxy and `COOKIE_SECURE=true`.
- Set `TRUST_PROXY=1` only when the server is directly behind one trusted proxy, and prevent direct access to the backend in that configuration.

CapyHome is intended to run as one application instance. Its SQLite write serialization, in-memory rate limits, and local session model are designed around that deployment shape.

#### Project structure

```text
public/                 Buildless browser application and static assets
public/index.html       Application shell
public/css/             Shared responsive styles
public/js/              Frontend state, rendering, routing, and localization
public/img/mascots/     Capybara mascot illustrations
public/locales/         Italian and English browser catalogs
server/api/             Express routers grouped by domain
server/i18n/            API translation loader and catalogs
server/middleware/      Security, session, and locale middleware
server/models/          Sequelize models and associations
server/services/        Shared queries and mutations
server/utils/           Validation, passwords, sessions, and HTTP errors
tests/                  Integration and localization tests
docker-compose.yaml     Single-service deployment and persistent volume
```

The frontend and backend locale catalogs are separate. Keep the Italian and English key sets and interpolation parameters synchronized. Translation values must remain plain text rather than HTML.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## :dizzy: Contributing

Contributions are welcome. Before opening a pull request, run the full test suite and keep changes consistent with the existing architecture: ESM modules, Express routers, Sequelize services, a buildless vanilla-JavaScript frontend, and synchronized locale catalogs.

When reporting a defect, include the runtime, operating system, reproduction steps, expected behavior, and relevant logs. Do not include real credentials, session cookies, databases, or other household data.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## :handshake: Support

If you find value in this project, consider supporting its continued maintenance and improvement.

<p align="center">
  <a href="https://ko-fi.com/M4M6KC01A">
    <img src="https://raw.githubusercontent.com/LightDestory/RepositoryTemplate/master/.github/assets/images/support.png" alt="Support LightDestory on Ko-fi" width="45%">
  </a>
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## :warning: License

This project is distributed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for the full terms.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## :hammer_and_wrench: Built With

- [Node.js](https://nodejs.org/)
- [Bun](https://bun.sh/)
- [Express](https://expressjs.com/)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
- [Helmet](https://helmetjs.github.io/)
- [Sequelize](https://sequelize.org/)
- [SQLite](https://www.sqlite.org/)
- Vanilla JavaScript, HTML, and CSS
- [Docker Compose](https://docs.docker.com/compose/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>
