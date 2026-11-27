#!/usr/bin/env python3
"""SNAP platform helper for the production iMac.

    python3 snap-helper.py setup URL         # save the platform address and this computer's key
    python3 snap-helper.py run [--dry-run]   # one check: make folders, count, report
    python3 snap-helper.py install [MINUTES] # run every MINUTES (default 5) via launchd
    python3 snap-helper.py status
    python3 snap-helper.py uninstall

Each run asks the platform which jobs to look at, then:

1. For each job that started production after this computer was connected,
   makes PHOTO IMPORT/<YY Job>/ from ~Job_Folder_Template with
   Session <Job>/ inside it from ~Session Template (the .cosessiondb renamed
   to match). It never overwrites, moves or deletes anything, and leaves a job
   alone once its folder exists. This takes over job-folders.py.
2. Counts image files: per part folder in the job folder, in the Capture One
   session, and in the NAS copy at /Volumes/SNAP Photo/PHOTOS/<YY Job>/.
3. Sends the platform those counts with the folder names, whether the session
   and the NAS folder exist, and whether a verify receipt is there.

It never sends images, file names, file contents or passwords.

The key: Settings, Integrations, iMac helper, Connect a computer shows it once.
"setup" stores it in the login Keychain (item "snap-platform-helper"). It can
also come from the SNAP_HELPER_KEY environment variable.

Settings (environment variables, all optional):
    SNAP_PLATFORM_URL   overrides the address saved by setup
    SNAP_PHOTO_IMPORT   default ~/PHOTO IMPORT
    SNAP_NAS_PHOTOS     default /Volumes/SNAP Photo/PHOTOS
    SNAP_HELPER_STATE   default ~/Library/Application Support/snap-helper/state.json

Standard library only, so it runs on the python3 that ships with macOS.
"""

import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

VERSION = "1.0.0"
LABEL = "com.snapphoto.snap-helper"
OLD_LABEL = "com.snapphoto.job-folders"
KEYCHAIN_SERVICE = "snap-platform-helper"
JOB_TEMPLATE = "~Job_Folder_Template"
SESSION_TEMPLATE = "~Session Template"
IMAGE_EXT = {
    ".nef", ".nrw", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2",
    ".jpg", ".jpeg", ".tif", ".tiff", ".png", ".heic",
}
# Capture One keeps exports, trash and its own cache inside a session; counting
# them would count the same frame twice.
SESSION_SKIP = {"output", "trash", "captureone", "selects"}

HOME = os.path.expanduser("~")
PHOTO_IMPORT = os.environ.get("SNAP_PHOTO_IMPORT", os.path.join(HOME, "PHOTO IMPORT"))
NAS_PHOTOS = os.environ.get("SNAP_NAS_PHOTOS", "/Volumes/SNAP Photo/PHOTOS")
SUPPORT = os.path.join(HOME, "Library", "Application Support", "snap-helper")
STATE = os.environ.get("SNAP_HELPER_STATE", os.path.join(SUPPORT, "state.json"))
CONFIG = os.path.join(SUPPORT, "config.json")
LOG_DIR = os.path.join(HOME, "Library", "Logs", "snap-helper")
PLIST = os.path.join(HOME, "Library", "LaunchAgents", LABEL + ".plist")
OLD_PLIST = os.path.join(HOME, "Library", "LaunchAgents", OLD_LABEL + ".plist")


def log(msg):
    line = "%s %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line)
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, "snap-helper.log"), "a") as f:
            f.write(line + "\n")
    except OSError:
        pass


def notify(title, msg):
    if shutil.which("osascript"):
        msg = msg.replace('"', "'")
        subprocess.run(["osascript", "-e", 'display notification "%s" with title "%s"' % (msg, title)], capture_output=True)


# ---------- settings ----------

def read_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True)
    os.replace(tmp, path)


def platform_url():
    url = os.environ.get("SNAP_PLATFORM_URL") or (read_json(CONFIG, {}) or {}).get("url") or ""
    return url.rstrip("/")


def url_ok(url):
    p = urllib.parse.urlparse(url)
    if p.scheme == "https" and p.netloc:
        return True
    return p.scheme == "http" and p.hostname in ("127.0.0.1", "localhost")


def helper_key():
    key = os.environ.get("SNAP_HELPER_KEY", "").strip()
    if key:
        return key
    if shutil.which("security"):
        r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout.strip()
    return ""


# ---------- platform ----------

def call(method, path, body=None):
    url = platform_url()
    req = urllib.request.Request(
        url + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + helper_key(), "Content-Type": "application/json", "User-Agent": "snap-helper/" + VERSION},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


# ---------- folders ----------

SAFE = re.compile(r"^[^/:.][^/:]*$")


def safe_name(name):
    return bool(name) and len(name) <= 200 and bool(SAFE.match(name))


def is_image(name):
    return os.path.splitext(name)[1].lower() in IMAGE_EXT and not name.startswith(".")


def count_images(root, skip=()):
    total = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d.lower() not in skip]
        total += sum(1 for f in filenames if is_image(f))
    return total


def session_dir(job_dir):
    try:
        names = sorted(os.listdir(job_dir))
    except OSError:
        return None
    for n in names:
        if n.startswith("Session ") and os.path.isdir(os.path.join(job_dir, n)):
            return os.path.join(job_dir, n)
    return None


def look_at_import(job_dir):
    if not os.path.isdir(job_dir):
        return {"exists": False, "parts": [], "session_exists": False, "session_images": 0}
    parts = []
    for n in sorted(os.listdir(job_dir)):
        p = os.path.join(job_dir, n)
        if n.startswith(".") or n.startswith("Session ") or not os.path.isdir(p) or not safe_name(n):
            continue
        parts.append({"name": n, "images": count_images(p)})
    ses = session_dir(job_dir)
    has_db = bool(ses) and any(f.endswith(".cosessiondb") for f in os.listdir(ses))
    return {
        "exists": True,
        "parts": parts[:50],
        "session_exists": has_db,
        "session_images": count_images(ses, SESSION_SKIP) if ses else 0,
    }


def look_at_nas(folder):
    d = os.path.join(NAS_PHOTOS, folder)
    if not os.path.isdir(d):
        return {"exists": False, "images": 0, "receipt": False}
    receipt = False
    for dirpath, dirnames, filenames in os.walk(d):
        dirnames[:] = [x for x in dirnames if not x.startswith(".")]
        if any("receipt" in f.lower() for f in filenames):
            receipt = True
            break
    return {"exists": True, "images": count_images(d), "receipt": receipt}


def create_job(root, folder):
    """Copy both templates into root/folder. Returns 'created', 'exists' or raises."""
    dest = os.path.join(root, folder)
    if os.path.exists(dest):
        return "exists"
    job_tpl = os.path.join(root, JOB_TEMPLATE)
    ses_tpl = os.path.join(root, SESSION_TEMPLATE)
    db_tpl = os.path.join(ses_tpl, SESSION_TEMPLATE + ".cosessiondb")
    for p in (job_tpl, ses_tpl, db_tpl):
        if not os.path.exists(p):
            raise FileNotFoundError("template missing: " + p)
    session = "Session " + folder.split(" ", 1)[-1]
    tmp = os.path.join(root, ".creating " + folder)
    if os.path.exists(tmp):
        raise FileExistsError("leftover from an earlier failed run, check and remove it: " + tmp)
    # Build under a hidden name, then rename, so a half-made folder never shows up.
    shutil.copytree(job_tpl, tmp, symlinks=True)
    shutil.copytree(ses_tpl, os.path.join(tmp, session), symlinks=True)
    os.rename(os.path.join(tmp, session, SESSION_TEMPLATE + ".cosessiondb"), os.path.join(tmp, session, session + ".cosessiondb"))
    os.rename(tmp, dest)
    return "created"


# ---------- one run ----------

def run(dry_run=False):
    if not platform_url() or not url_ok(platform_url()):
        log("no platform address (run setup first; https only); nothing done")
        return 1
    if not helper_key():
        log("no helper key found (run setup first); nothing done")
        return 1
    try:
        jobs = call("GET", "/api/helper/jobs").get("jobs", [])
    except urllib.error.HTTPError as e:
        log("the platform refused the helper (%s); check the key in Settings, Integrations" % e.code)
        return 1
    except (urllib.error.URLError, OSError, ValueError) as e:
        log("could not reach the platform: %s" % e)
        return 1

    photo_import = os.path.isdir(PHOTO_IMPORT)
    nas = os.path.isdir(NAS_PHOTOS)
    state = read_json(STATE, {"handled": {}}) or {"handled": {}}
    problem = None if photo_import else "PHOTO IMPORT not found at %s" % PHOTO_IMPORT
    out = []
    for j in jobs:
        folder = j.get("folder", "")
        if not safe_name(folder):
            continue
        entry = {"id": j["id"], "folder": folder}
        job_dir = os.path.join(PHOTO_IMPORT, folder)
        if j.get("create") and photo_import and j["id"] not in state["handled"]:
            if dry_run:
                log("would make: %s" % folder)
            else:
                try:
                    result = create_job(PHOTO_IMPORT, folder)
                    state["handled"][j["id"]] = {"folder": folder, "result": result, "at": datetime.datetime.now().isoformat(timespec="seconds")}
                    if result == "created":
                        entry["created"] = True
                        log("made: %s (with session)" % folder)
                        notify("SNAP job folder ready", folder)
                    else:
                        log("already there, left alone: %s" % folder)
                except OSError as e:
                    problem = "%s: %s" % (folder, e)
                    log("FAILED %s" % problem)
                    notify("SNAP job folder not made", problem)
        if photo_import and (j.get("import") or entry.get("created")):
            entry["import"] = look_at_import(job_dir)
        if nas and j.get("upload"):
            entry["upload"] = look_at_nas(folder)
        out.append(entry)

    if dry_run:
        print(json.dumps(out, indent=1))
        return 0
    write_json(STATE, state)
    try:
        r = call("POST", "/api/helper/report", {
            "version": VERSION,
            "photo_import_found": photo_import,
            "nas_mounted": nas,
            "problem": problem,
            "jobs": out,
        })
        log("reported %s jobs%s" % (r.get("recorded", 0), "" if nas else " (NAS not mounted)"))
    except (urllib.error.URLError, OSError, ValueError) as e:
        log("could not send the report: %s" % e)
        return 1
    return 0 if problem is None else 1


# ---------- setup and launchd ----------

def setup(url):
    url = url.rstrip("/")
    if not url_ok(url):
        print("Give the platform's address, starting with https://")
        return 2
    write_json(CONFIG, {"url": url})
    print("Saved the platform address: " + url)
    if not shutil.which("security"):
        print("No Keychain on this computer; set SNAP_HELPER_KEY instead.")
        return 1
    print("Paste the key from Settings, Integrations, iMac helper when asked (twice).")
    # security asks for the key itself, so it never appears in a command line.
    r = subprocess.run(["security", "add-generic-password", "-U", "-a", os.environ.get("USER", "snap"), "-s", KEYCHAIN_SERVICE, "-w"])
    if r.returncode != 0:
        print("The key was not saved.")
        return 1
    print("Saved. Next: python3 %s run, then python3 %s install" % (sys.argv[0], sys.argv[0]))
    return 0


def install(minutes=5):
    script = os.path.abspath(__file__)
    os.makedirs(os.path.dirname(PLIST), exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)
    plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>{script}</string>
        <string>run</string>
    </array>
    <key>StartInterval</key><integer>{secs}</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>{logs}/launchd.log</string>
    <key>StandardErrorPath</key><string>{logs}/launchd.log</string>
</dict>
</plist>
""".format(label=LABEL, script=script, secs=int(minutes) * 60, logs=LOG_DIR)
    with open(PLIST, "w") as f:
        f.write(plist)
    uid = str(os.getuid())
    # The helper takes over from job-folders.py: stop the old check so two
    # scripts never make folders at once. Its files are left where they are.
    if os.path.exists(OLD_PLIST):
        subprocess.run(["launchctl", "bootout", "gui/%s/%s" % (uid, OLD_LABEL)], capture_output=True)
        os.rename(OLD_PLIST, OLD_PLIST + ".off")
        print("Stopped the old job-folders check (its plist is now %s.off)." % OLD_PLIST)
    subprocess.run(["launchctl", "bootout", "gui/%s/%s" % (uid, LABEL)], capture_output=True)
    r = subprocess.run(["launchctl", "bootstrap", "gui/" + uid, PLIST])
    if r.returncode != 0:
        print("launchctl could not load " + PLIST)
        return 1
    print("Installed: runs every %s minutes while the Mac is awake." % minutes)
    print("Log: %s/snap-helper.log" % LOG_DIR)
    return 0


def uninstall():
    subprocess.run(["launchctl", "bootout", "gui/%s/%s" % (os.getuid(), LABEL)], capture_output=True)
    if os.path.exists(PLIST):
        os.remove(PLIST)
    print("Removed the scheduled run. No folders were touched.")
    return 0


def status():
    print("Version: " + VERSION)
    print("Scheduled run: %s" % ("installed" if os.path.exists(PLIST) else "not installed"))
    print("Old job-folders check: %s" % ("STILL INSTALLED" if os.path.exists(OLD_PLIST) else "off"))
    print("Platform: %s" % (platform_url() or "NOT set (run setup)"))
    print("Key: %s" % ("found" if helper_key() else "NOT found"))
    print("PHOTO IMPORT: %s" % (PHOTO_IMPORT if os.path.isdir(PHOTO_IMPORT) else "NOT found at " + PHOTO_IMPORT))
    for t in (JOB_TEMPLATE, SESSION_TEMPLATE):
        print("%s: %s" % (t, "found" if os.path.isdir(os.path.join(PHOTO_IMPORT, t)) else "NOT found"))
    print("NAS PHOTOS: %s" % ("mounted" if os.path.isdir(NAS_PHOTOS) else "not mounted (" + NAS_PHOTOS + ")"))
    path = os.path.join(LOG_DIR, "snap-helper.log")
    if os.path.exists(path):
        with open(path) as f:
            tail = f.readlines()[-5:]
        print("Last log lines:")
        sys.stdout.writelines(tail)
    return 0


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "setup" and len(argv) > 2:
        return setup(argv[2])
    if cmd == "run":
        return run(dry_run="--dry-run" in argv)
    if cmd == "install":
        return install(argv[2] if len(argv) > 2 else 5)
    if cmd == "uninstall":
        return uninstall()
    if cmd == "status":
        return status()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
