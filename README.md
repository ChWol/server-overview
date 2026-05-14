# Server Overview

A small local dashboard for checking whether configured work servers are reachable from this machine.

## Run

```sh
npm start
```

Open <http://localhost:4173>.

The status endpoint checks DNS, ICMP ping, and TCP connectivity on ports 22, 80, and 443. For the university server this should be run while connected to the VPN.

Servers added through the form are saved in `servers.json`. Short names are expanded with `.eda.cit.tum.de`.
