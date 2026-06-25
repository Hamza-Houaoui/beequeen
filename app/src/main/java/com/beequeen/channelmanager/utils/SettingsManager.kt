package com.beequeen.channelmanager.utils

import android.content.Context
import android.content.SharedPreferences

class SettingsManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("beequeen_settings", Context.MODE_PRIVATE)

    var botToken: String
        get() = prefs.getString("bot_token", "") ?: ""
        set(value) = prefs.edit().putString("bot_token", value).apply()

    var wholesaleChatId: String
        get() = prefs.getString("wholesale_chat_id", "") ?: ""
        set(value) = prefs.edit().putString("wholesale_chat_id", value).apply()

    var retailChatId: String
        get() = prefs.getString("retail_chat_id", "") ?: ""
        set(value) = prefs.edit().putString("retail_chat_id", value).apply()

    var syncFolderPath: String
        get() = prefs.getString("sync_folder_path", "") ?: ""
        set(value) = prefs.edit().putString("sync_folder_path", value).apply()
}
