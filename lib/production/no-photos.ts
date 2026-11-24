// Prepay orders with no photos: which of a gallery's prepay orders belong to
// a player Captura holds no image for. No network and no database here.
//
// The rule follows the hand check: a player who was photographed has images
// on their own record in the gallery; a player who missed photo day has
// none. Team composites sit on the team, not the player, so they do not
// count. Captura's live answers differ a little from its spec, so no field
// is assumed present.

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export type GalleryPlayer = { name: string | null; team: string | null; hasImages: boolean };
export type GalleryPlayers = {
  /** Players by Captura's own id, and by the roster's id where no Captura id claims it. */
  byId: Map<string, GalleryPlayer>;
  players: number;
  withImages: number;
};

/** The players of one gallery, read from Captura's single-gallery answer. */
export function readGalleryPlayers(rawGallery: unknown): GalleryPlayers {
  const gallery = obj(rawGallery);
  const teams = new Map<string, string>();
  for (const g of arr(gallery.groups)) {
    const group = obj(g);
    const id = str(group.id);
    const title = str(group.name) ?? str(group.title);
    if (id && title) teams.set(id, title);
  }
  const byId = new Map<string, GalleryPlayer>();
  const rosterIds: [string, GalleryPlayer][] = [];
  let players = 0;
  let withImages = 0;
  for (const s of arr(gallery.subjects)) {
    const subject = obj(s);
    const id = str(subject.id);
    if (!id) continue;
    const name = [str(subject.firstName), str(subject.lastName)].filter(Boolean).join(" ") || null;
    const team =
      arr(subject.galleryGroups)
        .map((g) => teams.get(str(typeof g === "object" ? obj(g).id : g) ?? ""))
        .filter(Boolean)
        .join(", ") || null;
    const player: GalleryPlayer = { name: name?.slice(0, 200) ?? null, team: team?.slice(0, 200) ?? null, hasImages: arr(subject.images).length > 0 };
    byId.set(id, player);
    const rosterId = str(subject.subjectID);
    if (rosterId) rosterIds.push([rosterId, player]);
    players += 1;
    if (player.hasImages) withImages += 1;
  }
  for (const [rosterId, player] of rosterIds) if (!byId.has(rosterId)) byId.set(rosterId, player);
  return { byId, players, withImages };
}

export type PrepayOrder = {
  order_id: number;
  order_type: string;
  status: string;
  total: number | null;
  refunded: number | null;
  order_date: string | null;
  subject_ids: string[];
};

export type NoPhotoReason = "no_images" | "no_player" | "not_in_gallery";
export type NoPhotoOrder = {
  order_id: number;
  reason: NoPhotoReason;
  player: string | null;
  team: string | null;
  order_date: string | null;
  total: number | null;
};

export type NoPhotoCheck =
  | { ready: false; why: "no_players" | "no_images_yet"; prepay: number }
  | { ready: true; prepay: number; withPhotos: number; missing: NoPhotoOrder[] };

/** A prepay order still owed something: not refunded in full. */
function owed(o: PrepayOrder) {
  if (o.order_type !== "prepay" || o.status === "refunded") return false;
  return !(o.total !== null && o.refunded !== null && o.total > 0 && o.refunded >= o.total);
}

/**
 * Sorts a gallery's prepay orders into those whose player has photos and
 * those to follow up. An order for several players is listed when any one of
 * them has no images. Until the gallery holds images at all there is nothing
 * to say, so nothing is listed.
 */
export function findNoPhotoOrders(orders: PrepayOrder[], gallery: GalleryPlayers): NoPhotoCheck {
  const prepay = orders.filter(owed);
  if (gallery.players === 0) return { ready: false, why: "no_players", prepay: prepay.length };
  if (gallery.withImages === 0) return { ready: false, why: "no_images_yet", prepay: prepay.length };
  const missing: NoPhotoOrder[] = [];
  for (const o of prepay) {
    const base = { order_id: o.order_id, order_date: o.order_date, total: o.total };
    if (o.subject_ids.length === 0) {
      missing.push({ ...base, reason: "no_player", player: null, team: null });
      continue;
    }
    const found = o.subject_ids.map((id) => gallery.byId.get(id));
    const without = found.find((p) => p && !p.hasImages);
    if (without) missing.push({ ...base, reason: "no_images", player: without.name, team: without.team });
    else if (found.some((p) => !p)) missing.push({ ...base, reason: "not_in_gallery", player: null, team: null });
  }
  // Named players first, by name; then the orders with nobody to name.
  missing.sort((a, b) => Number(!a.player) - Number(!b.player) || (a.player ?? "").localeCompare(b.player ?? "") || a.order_id - b.order_id);
  return { ready: true, prepay: prepay.length, withPhotos: prepay.length - missing.length, missing };
}

export const NO_PHOTO_REASON: Record<NoPhotoReason, string> = {
  no_images: "No photos of this player",
  no_player: "No player on the order",
  not_in_gallery: "Player not found in the gallery",
};

export const CASE_STATUSES = ["open", "offered", "makeup_booked", "refunded", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: "To do",
  offered: "Makeup offered",
  makeup_booked: "Makeup booked",
  refunded: "Refunded",
  closed: "Closed",
};
/** A case that still needs someone. */
export const CASE_WAITING: readonly CaseStatus[] = ["open", "offered", "makeup_booked"];
