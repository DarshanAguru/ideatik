import Foundation
import UserNotifications
import React

@objc(SystemNotification)
class SystemNotification: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if let error = error { reject("NOTIFICATION_PERMISSION_FAILED", error.localizedDescription, error) }
      else { resolve(granted) }
    }
  }

  @objc func notify(_ title: String, body: String, noteId: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    content.userInfo = ["noteId": noteId]
    let request = UNNotificationRequest(identifier: "ideatik.\(noteId).\(UUID().uuidString)", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request) { error in
      if let error = error { reject("NOTIFICATION_FAILED", error.localizedDescription, error) }
      else { resolve(nil) }
    }
  }
}
