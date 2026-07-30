package com.ideatik.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.Manifest
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemNotificationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SystemNotification"

  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.currentActivity?.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4912)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun notify(title: String, body: String, noteId: String, promise: Promise) {
    try {
      val channelId = "background_results"
      val manager = context.getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel(channelId, "Background results", NotificationManager.IMPORTANCE_DEFAULT))
      }
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setClass(context, MainActivity::class.java)
        data = android.net.Uri.parse("ideatik://note/$noteId")
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val pendingIntent = PendingIntent.getActivity(
        context, noteId.hashCode(), intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val notification = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(com.ideatik.app.R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .build()
      manager.notify((noteId.ifBlank { title }).hashCode(), notification)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("NOTIFICATION_FAILED", error)
    }
  }
}
