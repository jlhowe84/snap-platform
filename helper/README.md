# iMac helper

`snap-helper.py` runs on the production iMac. It takes over from
`job-folders.py` (SNAP-OS `_system/scripts/`), which made job folders from
Notion. The platform now says which jobs are in production.

Every 5 minutes it:

1. Asks the platform (`GET /api/helper/jobs`) which jobs to look at.
2. Makes `PHOTO IMPORT/<YY Job>/` from `~Job_Folder_Template`, with
   `Session <Job>/` from `~Session Template`, for each job that started
   production after the helper was connected. It never overwrites, moves or
   deletes anything. Jobs already in production when it was connected keep the
   folders made by hand; set the folder name on the job page ("Folder has
   another name") when it differs from `YY Job name`.
3. Counts image files (RAW, JPEG, TIFF, PNG, HEIC) per part folder in the job
   folder, in the Capture One session (leaving out Output, Trash and the cache),
   and in the NAS copy at `/Volumes/SNAP Photo/PHOTOS/<YY Job>/`, and notes a
   verify receipt there.
4. Sends those counts and folder names (`POST /api/helper/report`). Never
   images, file names, file contents or passwords.

The platform marks the **import done** when as many part folders hold images
as photographers were booked on the job (at least one; the session when the
folder has no parts), and **on the NAS** when the NAS copy holds at least as
many images as were ever seen in PHOTO IMPORT. The job page shows both, and the
production board shows them on each card.

## Setup on the iMac

1. In the platform: Settings, Integrations, iMac helper, **Connect a
   computer**. It shows a key once.
2. Copy `snap-helper.py` to the iMac (for example `~/OS/_system/scripts/`).
3. `python3 snap-helper.py setup https://<platform address>` and paste the key
   when asked (twice). It is saved in the login Keychain as
   `snap-platform-helper`.
4. `python3 snap-helper.py run` once. It should end with "reported N jobs".
5. `python3 snap-helper.py install` starts the 5-minute run and switches off
   the old job-folders check (its plist is renamed to `.off`). If macOS asks
   whether python3 may use the Keychain item, choose Always Allow.

`status` shows what it finds; `uninstall` stops it. The log is
`~/Library/Logs/snap-helper/snap-helper.log`. To stop a computer for good,
press Disconnect next to it in Settings; its key stops working at once.

Tested end to end against the app in `e2e/helper-path.spec.ts` with temporary
folders. Not yet run on the iMac, the real templates or NASTY.
