import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var blackView: UIView?
    private var captureTimer: Timer?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        startScreenProtection()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func startScreenProtection() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(didTakeScreenshot),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )
        let timer = Timer(timeInterval: 0.4, repeats: true) { [weak self] _ in
            self?.syncScreenCapture()
        }
        RunLoop.main.add(timer, forMode: .common)
        captureTimer = timer
        syncScreenCapture()
    }

    @objc private func didTakeScreenshot() {
        showBlack(message: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.syncScreenCapture()
        }
    }

    private func syncScreenCapture() {
        if UIScreen.main.isCaptured {
            showBlack(message: false)
        } else {
            hideBlack()
        }
    }

    private func showBlack(message: Bool) {
        guard blackView == nil, let w = window else { return }
        let v = UIView(frame: w.bounds)
        v.backgroundColor = .black
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        v.accessibilityViewIsModal = true
        if message {
            let label = UILabel()
            label.translatesAutoresizingMaskIntoConstraints = false
            label.text = "Tangkap layar / rekam tidak diizinkan"
            label.textColor = .white
            label.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
            label.textAlignment = .center
            v.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerXAnchor.constraint(equalTo: v.centerXAnchor),
                label.centerYAnchor.constraint(equalTo: v.centerYAnchor),
            ])
        }
        w.addSubview(v)
        w.bringSubviewToFront(v)
        blackView = v
    }

    private func hideBlack() {
        blackView?.removeFromSuperview()
        blackView = nil
    }
}
