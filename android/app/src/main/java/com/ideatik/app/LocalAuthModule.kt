package com.ideatik.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.*

class LocalAuthModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var authPromise: Promise? = null
    private val REQUEST_CODE_CONFIRM_DEVICE_CREDENTIALS = 1888

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String {
        return "LocalAuthModule"
    }

    @ReactMethod
    fun isDeviceSecure(promise: Promise) {
        val keyguardManager = reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        promise.resolve(keyguardManager.isKeyguardSecure)
    }

    @Suppress("DEPRECATION")
    @ReactMethod
    fun authenticate(title: String, description: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Activity is null")
            return
        }

        val keyguardManager = reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (!keyguardManager.isKeyguardSecure) {
            // If device is not secure (no PIN/fingerprint set up), resolve true
            promise.resolve(true)
            return
        }

        authPromise = promise
        val intent = keyguardManager.createConfirmDeviceCredentialIntent(title, description)
        if (intent != null) {
            activity.startActivityForResult(intent, REQUEST_CODE_CONFIRM_DEVICE_CREDENTIALS)
        } else {
            promise.reject("INTENT_NULL", "Unable to create confirm device credential intent")
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_CODE_CONFIRM_DEVICE_CREDENTIALS) {
            val promise = authPromise
            authPromise = null
            if (promise != null) {
                if (resultCode == Activity.RESULT_OK) {
                    promise.resolve(true)
                } else {
                    promise.resolve(false)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op
    }
}
