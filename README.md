# 🐝 BeeQueen Channel Manager

**BeeQueen** is a comprehensive management system for wholesale and retail businesses in the fashion and footwear industry. It seamlessly links physical inventory with Telegram channels for real-time automated product publishing, order management, and financial tracking.

## ✨ Features

### 📦 Inventory & Catalog Management
- Granular stock tracking by size and color
- Full series / broken series detection
- Pre-order management with auto-reconciliation

### 🤖 Telegram Integration
- Auto-publish products to wholesale/retail channels
- Real-time stock updates via Telegram message edits
- Intelligent series breakdown: splits full series to retail when singles sell
- Self-healing upload mechanism (auto-fixes broken file references)
- Offline sync queue with automatic retry

### 💰 Financial Management
- Supplier invoice tracking with debt ledger
- Customer accounts with credit tracking
- Multi-item invoice with discounts (fixed & percentage)
- Profit margin analysis

### 💾 Backup & Sync
- Local auto-backup (`beequeen_backup.json`)
- Cloud backup via private Telegram channel
- One-click restore on new devices

### 🎨 Modern UI
- Dark theme with gold accents (Glassmorphism design)
- Responsive: mobile, tablet (portrait & landscape)
- Instant predictive search
- Virtualized lists for performance
- Lightbox media viewer

## 🏗 Architecture

- **Frontend:** Kotlin (Android native) + React/JSX (Web)
- **Backend:** Telegram Bot API (cloud sync & channel management)
- **Storage:** Local JSON backup + IndexedDB media cache + SharedPreferences
- **Build:** Gradle (Android) + Vite (Web)

## 📲 Download

[Download latest APK](https://github.com/Hamza-Houaoui/beequeen/releases)

## 🚀 Getting Started

1. Create a Telegram Bot via [@BotFather](https://t.me/BotFather) and get your token
2. Create Telegram channels for: wholesale, retail, warehouse, invoices, database
3. Set your bot as admin in each channel
4. Enter bot token and chat IDs in the app settings
5. Start adding products!

## 🔧 Tech Stack

- **Android:** Kotlin, Room (SQLite), Gradle
- **Web:** React, Vite, Capacitor, IndexedDB
- **Cloud:** Telegram Bot API
