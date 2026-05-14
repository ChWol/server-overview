# Server Overview

A small local dashboard for checking whether configured work servers are reachable from this machine.

## Run

```sh
npm start
```

Open <http://localhost:4173>.

The status endpoint checks DNS, ICMP ping, and TCP connectivity on ports 22, 80, and 443. For the university server this should be run while connected to the VPN.

The GitHub Pages version is static and reads its display list from `public/servers.config.js`. Browser JavaScript cannot perform ICMP ping or raw TCP checks, so the page is a clean static overview while the macOS menu-bar app performs the live checks locally.

## macOS Menu Bar

Build the native menu-bar companion:

```sh
chmod +x macos/ServerOverviewBar/build.sh
macos/ServerOverviewBar/build.sh
```

Run `macos/ServerOverviewBar/build/Server Overview Bar.app`. It uses the hard-coded server list in `macos/ServerOverviewBar/MenuBarApp.swift` and refreshes server status every 60 seconds.

For a no-terminal launch after building once, double-click `Start Menu Bar.command`.

## GitHub Pages

Deploy the static website from the `public/` folder:

1. Push this repository to GitHub.
2. In the repository, open Settings -> Pages.
3. Set Source to `Deploy from a branch`.
4. Select branch `main` and folder `/public`.
5. Save.

GitHub will publish the site at `https://<username>.github.io/<repo-name>/`.
