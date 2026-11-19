import "server-only";

import { createSign } from "node:crypto";
import type { ServiceAccount } from "@/lib/gmail/client";

// Google Drive as the Workspace service account itself (no delegation, so it
// acts for nobody). It can only see what has been shared with its own
// address: the company shares one folder with it, and that folder's id is
// the company's lab.invoice_drive_folder setting.
//
// This client only ever looks inside that folder: it reads the folder, finds
// or makes a month folder in it, and adds PDFs there. It never deletes,
// moves, renames or shares anything.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const ID = /^[A-Za-z0-9_-]{10,100}$/;

/** A folder id from what a person pasted: the id itself or the folder's link. */
export function folderIdFrom(text: string): string | null {
  const t = text.trim();
  const fromLink = /\/folders\/([A-Za-z0-9_-]{10,100})/.exec(t)?.[1] ?? /[?&]id=([A-Za-z0-9_-]{10,100})/.exec(t)?.[1];
  if (fromLink) return fromLink;
  return ID.test(t) ? t : null;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A signed JWT asking Google for a Drive token as the service account itself. */
export function serviceAssertion(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: DRIVE_SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(sa.private_key).toString("base64url")}`;
}

export class DriveError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`Drive request failed (${status}${reason ? `, ${reason}` : ""})`);
    this.name = "DriveError";
  }
}

/** What to tell a person when Drive says no. */
export function driveProblem(error: unknown): string {
  if (error instanceof DriveError) {
    if (error.reason === "accessNotConfigured" || error.reason === "SERVICE_DISABLED") {
      return "The Google Drive API is not turned on for the platform's Google Cloud project yet.";
    }
    if (error.status === 404) return "The platform cannot see that folder. Share it with the platform's Google address first.";
    if (error.status === 403) return "The platform can see the folder but may not add files. Share it as Content manager.";
    return error.message;
  }
  return error instanceof Error && /token/i.test(error.message) ? error.message : "Drive could not be reached.";
}

type FetchLike = typeof fetch;
const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function createDriveClient(sa: ServiceAccount, rootFolderId: string, fetchImpl: FetchLike = fetch) {
  if (!ID.test(rootFolderId)) throw new Error("The Drive folder id is not valid");
  let token: { value: string; expiresAt: number } | null = null;
  // Folders this client may add to: the shared folder and month folders it found inside it.
  const known = new Set([rootFolderId]);
  const months = new Map<string, Promise<string>>();

  async function getToken() {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const res = await fetchImpl(sa.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAssertion(sa) }),
    });
    if (!res.ok) throw new Error(`Google token request failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function call<T>(url: string, init?: { method: string; headers: Record<string, string>; body: BodyInit }): Promise<T> {
    const res = await fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${await getToken()}`, accept: "application/json", ...init?.headers },
    });
    if (!res.ok) {
      const reason = await res
        .json()
        .then((b: { error?: { errors?: { reason?: unknown }[]; status?: unknown } }) => {
          const r = b?.error?.errors?.[0]?.reason ?? b?.error?.status;
          return typeof r === "string" ? r.replace(/[^A-Za-z_]/g, "").slice(0, 60) : "";
        })
        .catch(() => "");
      throw new DriveError(res.status, reason);
    }
    return (await res.json()) as T;
  }

  function mustKnow(parent: string) {
    if (!known.has(parent)) throw new Error("That folder is outside the shared invoice folder");
  }

  async function findChild(parent: string, name: string, folder: boolean) {
    mustKnow(parent);
    const q = `'${quote(parent)}' in parents and name = '${quote(name)}' and trashed = false and mimeType ${folder ? "=" : "!="} '${FOLDER}'`;
    const list = await call<{ files?: { id: string; name: string }[] }>(
      `${API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    );
    return list.files?.[0] ?? null;
  }

  return {
    /** The shared folder's name and whether files may be added. No file contents. */
    root: () =>
      call<{ id: string; name: string; mimeType: string; capabilities?: { canAddChildren?: boolean } }>(
        `${API}/${encodeURIComponent(rootFolderId)}?fields=${encodeURIComponent("id,name,mimeType,capabilities(canAddChildren)")}&supportsAllDrives=true`,
      ),
    /** The id of a month folder such as "2026-11" inside the shared folder, made when missing. */
    monthFolder(name: string): Promise<string> {
      if (!/^\d{4}-\d{2}$/.test(name)) return Promise.reject(new Error("A month folder is named like 2026-11"));
      let pending = months.get(name);
      if (!pending) {
        pending = (async () => {
          const found = await findChild(rootFolderId, name, true);
          const id =
            found?.id ??
            (
              await call<{ id: string }>(`${API}?fields=id&supportsAllDrives=true`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, mimeType: FOLDER, parents: [rootFolderId] }),
              })
            ).id;
          known.add(id);
          return id;
        })();
        months.set(name, pending);
        pending.catch(() => months.delete(name));
      }
      return pending;
    },
    /** A file of this name already in the folder, so nothing is filed twice. */
    findFile: (parent: string, name: string) => findChild(parent, name, false),
    /** Adds one PDF to a folder this client found. Returns the new file's id. */
    async uploadPdf(parent: string, name: string, bytes: Uint8Array): Promise<string> {
      mustKnow(parent);
      const boundary = `snap${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent], mimeType: "application/pdf" })}\r\n--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`;
      const body = Buffer.concat([Buffer.from(head), Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`)]);
      const made = await call<{ id: string }>(`${UPLOAD}?uploadType=multipart&fields=id&supportsAllDrives=true`, {
        method: "POST",
        headers: { "content-type": `multipart/related; boundary=${boundary}` },
        body,
      });
      return made.id;
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
