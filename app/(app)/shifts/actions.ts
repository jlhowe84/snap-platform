"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { responseMessage } from "@/lib/staffing/plan";

// A crew member answers an offer. The database decides whether it is still
// theirs to take (respond_to_shift), so two people cannot take one shift.

export type ShiftAnswer = { ok: boolean; message: string } | null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function answerShift(shiftId: string, accept: boolean, _prev: ShiftAnswer, _form: FormData): Promise<ShiftAnswer> {
  await requireStaff(["crew"]);
  const shift = z.uuid().safeParse(shiftId);
  if (!shift.success) return { ok: false, message: "That shift was not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_shift", { p_shift_id: shift.data, p_accept: accept });
  if (error) return { ok: false, message: "That did not go through. Try again." };
  revalidatePath("/shifts");
  return responseMessage(data);
}

// A crew member keeps their own phone, town, home address and emergency
// contact current. The database function only ever touches the row of the
// person signed in, and nothing else about them.

export type DetailsState = { ok: boolean; message: string } | null;

export async function saveMyDetails(_prev: DetailsState, form: FormData): Promise<DetailsState> {
  await requireStaff(["crew"]);
  const text = (max: number) => z.string().trim().max(max);
  const f = z
    .object({ phone: text(40), city: text(80), state: text(40), address: text(300), emergency_name: text(120), emergency_phone: text(40) })
    .safeParse({
      phone: form.get("phone") ?? "",
      city: form.get("city") ?? "",
      state: form.get("state") ?? "",
      address: form.get("address") ?? "",
      emergency_name: form.get("emergency_name") ?? "",
      emergency_phone: form.get("emergency_phone") ?? "",
    });
  if (!f.success) return { ok: false, message: "Something is too long. Shorten it and save again." };
  if (f.data.address && f.data.address.length < 5) return { ok: false, message: "Enter your full home address." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_crew_details", {
    p_phone: f.data.phone,
    p_city: f.data.city,
    p_state: f.data.state,
    p_address: f.data.address,
    p_emergency_name: f.data.emergency_name,
    p_emergency_phone: f.data.emergency_phone,
  });
  if (error) return { ok: false, message: "Could not save. Try again." };
  revalidatePath("/shifts/me");
  return { ok: true, message: "Saved. Thank you for keeping this current." };
}
