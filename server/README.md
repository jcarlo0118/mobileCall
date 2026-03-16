##  Project Overview

This system acts as the "Central Brain" for a localized ecosystem, 
managing the hologram companion and providing a platform for health monitoring, biometric data, 
without requiring an external internet connection.


---


## Features

* **Persistent Storage:** Utilizes a lightweight SQLite database for storing user credentials and system logs.


---


## Prerequisites

Before installation, ensure your environment has the following:

* **Python 3:** The core programming language for the backend.
* **SQLite3:** The database engine for local data storage.
* **LAN Environment:** A local router or access point to connect devices without internet.


---


## Installation

### on Windows 11

Run the following commands in your terminal to set up the environment:

1. **Clone the repository**
```DOS
git clone https://github.com/jcarlo0118/LocalizedEcosystemHub.git
cd LocalizedEcosystemHub
```

2. **Enable virtual enviroment**
```DOS
python -m venv .venv
call .venv\Scripts\activate
```

3. **Install dependencies**
```DOS
python -m pip install -r requirements.txt

```


### on Linux(Debian)

Run the following commands in your terminal to set up the environment:

1. **Clone the repository**
```bash
git clone https://github.com/jcarlo0118/LocalizedEcosystemHub.git
cd LocalizedEcosystemHub
```

2. **Enable virtual enviroment**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```


---


##  Running the System

1. **Start the Flask Server:**
```bash
flask --app flaskr/app.py run --host=0.0.0.0
```
> [!TIP]
> **Network Security:** > * **On Windows:** You will likely see a Windows Firewall popup. You **must** allow access for "Private Networks" for the LAN connection to work.
> * **On Debian:** No popup will appear, but if you cannot connect, ensure your firewall is configured to allow traffic on port 5000 (e.g., `sudo ufw allow 5000`).
> * The --host=0.0.0.0 flag allows the server to listen to all devices on your local network.
2. **Accessing the Hub:**
Open Google Chrome and navigate to:

> `http://127.0.0.1:5000` (Localhost)
> 
> `http://[Your-Server-IP]:5000` (Network Access)


---


## Notes:
* the web app is made to run on google chrome, if any other web browser is used, the app may look off due to CSS styling 
