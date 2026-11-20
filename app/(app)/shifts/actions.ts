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
