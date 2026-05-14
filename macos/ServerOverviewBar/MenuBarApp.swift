import Cocoa
import Foundation
import Network

private let domainSuffix = ".eda.cit.tum.de"
private let defaultPorts = [22, 80, 443]
private let checkTimeout: TimeInterval = 2.5
private let refreshInterval: TimeInterval = 60
private let onlineColor = NSColor(red: 0.04, green: 0.55, blue: 0.31, alpha: 1)

struct Server {
    let id: String
    let name: String
    let host: String
    let description: String
    let ports: [Int]?
}

private let configuredServers = [
    Server(
        id: "rodia",
        name: "Rodia",
        host: "rodia.eda.cit.tum.de",
        description: "Workstation",
        ports: defaultPorts
    ),
    Server(
        id: "gpu18",
        name: "Gpu18",
        host: "gpu18.eda.cit.tum.de",
        description: "GPU server",
        ports: defaultPorts
    ),
    Server(
        id: "gpu19",
        name: "Gpu19",
        host: "gpu19.eda.cit.tum.de",
        description: "GPU server",
        ports: defaultPorts
    )
]

struct ServerStatus {
    let server: Server
    let isUp: Bool
    let latencyMs: Int?
    let reachableBy: String
}

final class StatusChecker {
    func check(_ server: Server) -> ServerStatus {
        let ports = server.ports ?? defaultPorts
        let ping = pingHost(server.host)
        var tcpResults: [(port: Int, latencyMs: Int?)] = []

        for port in ports {
            if let latency = checkTcp(host: server.host, port: port) {
                tcpResults.append((port, latency))
            }
        }

        let isUp = ping.ok || !tcpResults.isEmpty
        let latencies = ([ping.latencyMs] + tcpResults.map { $0.latencyMs }).compactMap { $0 }
        let reachable = reachableBy(ping: ping.ok, tcpResults: tcpResults)

        return ServerStatus(
            server: server,
            isUp: isUp,
            latencyMs: latencies.min(),
            reachableBy: reachable
        )
    }

    private func pingHost(_ host: String) -> (ok: Bool, latencyMs: Int?) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/sbin/ping")
        process.arguments = ["-c", "1", "-W", String(Int(checkTimeout * 1000)), host]

        let startedAt = Date()
        do {
            try process.run()
            process.waitUntilExit()
            let latency = Int(Date().timeIntervalSince(startedAt) * 1000)
            return (process.terminationStatus == 0, process.terminationStatus == 0 ? latency : nil)
        } catch {
            return (false, nil)
        }
    }

    private func checkTcp(host: String, port: Int) -> Int? {
        let startedAt = Date()
        let semaphore = DispatchSemaphore(value: 0)
        let connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: NWEndpoint.Port.IntegerLiteralType(port)), using: .tcp)
        var didConnect = false

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                didConnect = true
                semaphore.signal()
            case .failed, .cancelled:
                semaphore.signal()
            default:
                break
            }
        }

        connection.start(queue: DispatchQueue.global(qos: .utility))
        _ = semaphore.wait(timeout: .now() + checkTimeout)
        connection.cancel()

        return didConnect ? Int(Date().timeIntervalSince(startedAt) * 1000) : nil
    }

    private func reachableBy(ping: Bool, tcpResults: [(port: Int, latencyMs: Int?)]) -> String {
        var checks: [String] = []
        if ping {
            checks.append("ping")
        }
        checks.append(contentsOf: tcpResults.map { ":\($0.port)" })
        return checks.isEmpty ? "No response" : checks.joined(separator: ", ")
    }
}

final class MenuBarController: NSObject, NSApplicationDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let checker = StatusChecker()
    private var statuses: [ServerStatus] = []
    private var isChecking = false
    private var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setStatusTitle("Checking", color: .systemGray)
        rebuildMenu()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    private func refresh() {
        if isChecking {
            return
        }

        isChecking = true
        if statuses.isEmpty {
            setStatusTitle("Checking", color: .systemGray)
        }
        rebuildMenu()

        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else { return }
            let results = configuredServers.map { self.checker.check($0) }

            DispatchQueue.main.async {
                self.statuses = results
                self.isChecking = false
                self.updateStatusTitle()
                self.rebuildMenu()
            }
        }
    }

    private func updateStatusTitle() {
        if statuses.isEmpty {
            setStatusTitle("No servers", color: .systemGray)
            return
        }

        let onlineCount = statuses.filter { $0.isUp }.count
        let allOnline = onlineCount == statuses.count
        let color: NSColor = allOnline ? onlineColor : .systemRed
        setStatusTitle("\(onlineCount)/\(statuses.count)", color: color)
    }

    private func setStatusTitle(_ title: String, color: NSColor) {
        guard let button = statusItem.button else { return }
        let text = "● \(title)"
        button.attributedTitle = NSAttributedString(
            string: text,
            attributes: [
                .foregroundColor: color,
                .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .semibold)
            ]
        )
    }

    private func rebuildMenu() {
        let menu = NSMenu()

        if isChecking && statuses.isEmpty {
            menu.addItem(disabledItem("Checking servers..."))
        } else if statuses.isEmpty {
            menu.addItem(disabledItem("No status yet"))
        } else {
            for status in statuses {
                let item = NSMenuItem()
                item.attributedTitle = attributedServerTitle(status)
                item.submenu = submenu(for: status)
                menu.addItem(item)
            }
        }

        menu.addItem(.separator())
        menu.addItem(disabledItem("\(configuredServers.count) hard-coded servers"))
        let refreshItem = NSMenuItem(title: "Refresh Now", action: #selector(refreshNow), keyEquivalent: "r")
        refreshItem.target = self
        refreshItem.isEnabled = !isChecking
        menu.addItem(refreshItem)
        menu.addItem(NSMenuItem(title: "Quit Server Overview", action: #selector(quit), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    private func attributedServerTitle(_ status: ServerStatus) -> NSAttributedString {
        let color: NSColor = status.isUp ? onlineColor : .systemRed
        let title = "● \(status.server.name)"
        return NSAttributedString(
            string: title,
            attributes: [
                .foregroundColor: color,
                .font: NSFont.systemFont(ofSize: 13, weight: .semibold)
            ]
        )
    }

    private func submenu(for status: ServerStatus) -> NSMenu {
        let submenu = NSMenu()
        submenu.addItem(disabledItem(status.server.host))

        if !status.server.description.isEmpty {
            submenu.addItem(disabledItem(status.server.description))
        }

        let state = status.isUp ? "Online" : "Offline"
        let latency = status.latencyMs.map { "\($0) ms" } ?? "n/a"
        submenu.addItem(disabledItem("\(state) · \(latency)"))
        submenu.addItem(disabledItem(status.reachableBy))
        return submenu
    }

    private func disabledItem(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    @objc private func refreshNow() {
        refresh()
    }

    @objc private func quit() {
        NSApplication.shared.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = MenuBarController()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
