# 📦 WhatsApp Bulk Sender

A Node.js-based **WhatsApp bulk message sender** that automates sending personalized messages to multiple contacts using [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js).  
It connects to a **MySQL database**, fetches pending messages, and delivers them via WhatsApp Web with built-in rate limits and automatic status updates.

---

## 🧠 Overview

This project allows you to send WhatsApp messages in bulk with controlled limits and persistence.  
Messages are fetched from a MySQL table (`broker`) and sent using the WhatsApp Web API automation.

✅ Key Features:
- Automated WhatsApp messaging via `whatsapp-web.js`  
- Persistent authentication using `LocalAuth` (QR code scanning required only once)  
- MySQL integration with message tracking (`status` field)  
- Daily and per-epoch send limits (to avoid spam detection)  
- 30-second delay between each message  
- Timezone handling for Tehran (+03:30 GMT)

---

## 📁 Project Structure

```

whatsapp-bulk/
├── app.js
├── package.json
├── package-lock.json
├── Dockerfile
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
├── whatsapp-cron/
└── db.sql
````

---

## ⚙️ Requirements

Before you begin, ensure you have the following installed:

- **Node.js** ≥ 18.x  
- **MySQL / MariaDB**  
- **Google Chrome** or **Chromium** (for `puppeteer`)  
- **npm** or **yarn**

---

## 🧩 Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/BaseMax/whatsapp-bulk.git
cd whatsapp-bulk
npm install
````

---

## 🧾 Environment Variables

Create a `.env` file in the project root (you can copy `.env.example`):

```bash
cp .env.example .env
```

Then edit the values as needed:

```env
DB_HOST=localhost
DB_USER=username
DB_PASSWORD=password
DB_NAME=db
DB_PORT=3306
```

---

## 🧱 Database Setup

Use the provided SQL file to create and initialize your database:

```bash
mysql -u username -p db < db.sql
```

### Table Structure

The database includes a `broker` table for managing messages:

| Column    | Type        | Description                 |
| --------- | ----------- | --------------------------- |
| id        | bigint(20)  | Primary key                 |
| mobile    | varchar(20) | Recipient phone number      |
| type      | varchar(50) | Message type or category    |
| text      | longtext    | Message content             |
| status    | int(1)      | 0=pending, 1=sent, 2=failed |
| create_at | int(10)     | Creation timestamp          |
| update_at | int(10)     | Last update timestamp       |

Example data:

```sql
INSERT INTO broker (mobile, type, text, status, create_at)
VALUES ('09131111010', 'test', 'سلام\nپیام تست می باشد.', 0, UNIX_TIMESTAMP());
```

---

## 🚀 Usage

### 1. Start the App

```bash
npm start
```

### 2. Scan the QR Code

When you first run the script, a QR code will appear in your terminal.
Scan it using your **WhatsApp mobile app → Linked Devices → Link a Device**.

Once authenticated, your session will be stored in the `sessions/` directory for future runs.

---

## ⏱️ Message Flow

1. The script connects to your MySQL database.
2. It checks how many messages were sent in the last 24 hours.
3. It fetches up to 50 pending messages (`status = 0`).
4. It sends each message to the formatted number (`+98...`) with a 30-second delay.
5. After each message is sent:

   * The `status` is updated to `1`.
   * The `update_at` timestamp is set.
6. The process stops when the daily limit (`300 messages`) is reached.

---

## 🔢 Helper Functions

* `formatNumber(number)`: Formats Iranian phone numbers into `+98` format.
* `getTehranUnixTime()`: Returns current Tehran time in Unix format.
* `fetchContacts()`: Fetches pending messages from MySQL with rate limiting.
* `markAsSent(id)`: Updates message status after sending.

---

## 🐳 Docker Support

You can run this project in a Docker container.

### Build Image

```bash
docker build -t whatsapp-bulk .
```

### Run Container

```bash
docker run -d --env-file .env whatsapp-bulk
```

---

## 🧠 Cron Integration (Optional)

You can automate the sender to run periodically (e.g., every hour) using `cron`:

```bash
0 * * * * /usr/bin/node /path/to/whatsapp-bulk/app.js >> /var/log/whatsapp-bulk.log 2>&1
```

This ensures messages are sent continuously without manual startup.

---

## 📊 Logs

All activities are logged to the console:

* Sent messages count
* Pending message count
* Delivery status updates
* Errors and DB connection issues

You can redirect logs to a file if running in production:

```bash
npm start >> app.log 2>&1
```

---

## 🪪 License

This project is licensed under the **MIT License**.

---

## 👨‍💻 Author

**Seyyed Ali Mohammadiyeh (Max Base)**
🌐 [GitHub](https://github.com/BaseMax)

---

## ⭐ Contributing

Pull requests and feature improvements are welcome!
Please fork the repo and create a new branch for your changes.

---

## 🧩 Example Output

```bash
> node app.js
QR received — scan with your phone:
███████████████████████████████████████████
Client is ready!
Messages sent in last 24h: 120. Fetching up to 50 new messages.
Message sent to +989131111010
Status updated for id 1
All messages processed.
```

---

## 🛡️ Disclaimer

This project is **for educational and personal use only**.
Sending unsolicited bulk messages may violate WhatsApp’s Terms of Service.
Use responsibly and ensure compliance with local laws and regulations.

Copyright 2025, Seyyed Ali Mohammadiyeh (Max Base)
