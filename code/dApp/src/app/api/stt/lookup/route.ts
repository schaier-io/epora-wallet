import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupSttWallets, SttLookupInputError } from "@/lib/stt-cache/lookup";
import { getErrorMessage } from "@/lib/http/errors";

export const runtime = "nodejs";

const RequestSchema = z
  .object({
    paymentKeyHash: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    txLimit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().trim().min(1).optional()
  })
  .superRefine((value, context) => {
    const hasPaymentKeyHash = typeof value.paymentKeyHash === "string";
    const hasAddress = typeof value.address === "string";

    if (hasPaymentKeyHash === hasAddress) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of paymentKeyHash or address must be provided."
      });
    }
  });

export async function POST(request: Request) {
  try {
    const bodyUnknown: unknown = await request.json();
    const body = RequestSchema.parse(bodyUnknown);
    const result = await lookupSttWallets(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid STT lookup request."
        },
        {
          status: 400
        }
      );
    }

    if (error instanceof SttLookupInputError) {
      return NextResponse.json(
        {
          error: error.message
        },
        {
          status: 400
        }
      );
    }

    return NextResponse.json(
      {
        error: getErrorMessage(error)
      },
      {
        status: 500
      }
    );
  }
}
