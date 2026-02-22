# Deploy Biryani Lagbe on PythonAnywhere

This guide is for running the Flask backend (`app.py`) so all users see the same shared data.

## 1) Upload project
- Put this folder in: `/home/<your_pythonanywhere_username>/Biriyani_lagbe`

## 2) Create virtualenv and install packages
Open **Bash console** on PythonAnywhere:

```bash
cd ~/Biriyani_lagbe
python3.10 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

If your Python version is not `3.10`, use your available version (`3.11`, etc).

## 3) Create Web App (Manual config)
- Go to **Web** tab
- Click **Add a new web app**
- Choose your domain (`<username>.pythonanywhere.com`)
- Choose **Manual configuration**
- Choose the same Python version as your venv

## 4) Set virtualenv path
In **Web** tab:
- Virtualenv: `/home/<your_pythonanywhere_username>/Biriyani_lagbe/.venv`

## 5) Configure WSGI file
Open your PythonAnywhere WSGI file (from Web tab) and replace with:

```python
import sys

project_home = '/home/<your_pythonanywhere_username>/Biriyani_lagbe'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

from app import application
```

`app.py` already exposes `application = app`.

## 6) Static files + uploads
No extra static mapping is required because Flask serves from project root.
Uploaded images are stored in:
- `/home/<your_pythonanywhere_username>/Biriyani_lagbe/uploads`

## 7) Reload
- Click **Reload** in Web tab.

## 8) Verify shared data
Open in two devices/browsers:
- `https://<your_pythonanywhere_username>.pythonanywhere.com`

Add data from one device, refresh in another. Both should see same records.

## Important notes
- Do **not** use `localhost` links for sharing.
- Share only your PythonAnywhere domain URL.
- After first deploy, do a hard refresh once (`Ctrl+F5`) to update service worker.
- If old cache persists, clear site data / unregister service worker once.
