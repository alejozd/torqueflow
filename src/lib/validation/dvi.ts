import { z } from "zod";
import { DVI_CHECKLIST_STATUSES } from "@/lib/dvi/checklist-items";

export const dviChecklistStatusSchema = z.enum(DVI_CHECKLIST_STATUSES);
export const dviFotoMomentoSchema = z.enum(["ANTES", "DESPUES"]);
