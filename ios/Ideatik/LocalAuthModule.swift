import Foundation
import LocalAuthentication
import React

@objc(LocalAuthModule)
class LocalAuthModule: NSObject {
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  func isDeviceSecure(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let context = LAContext()
    var error: NSError?
    let isSecure = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
    resolve(isSecure)
  }

  @objc
  func authenticate(_ title: String, description: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let context = LAContext()
    var error: NSError?
    
    if context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) {
      context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: description) { success, authenticationError in
        if success {
          resolve(true)
        } else {
          resolve(false)
        }
      }
    } else {
      resolve(true)
    }
  }
}
