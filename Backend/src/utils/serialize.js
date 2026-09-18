// Converts a Prisma row (or an array of them) into the exact JSON shape the
// old Mongoose `.toJSON()`/`.populate()` output had, so the Frontend needs no
// changes:
//   - `id` -> `_id` (recursively, including into any included relation)
//   - a singular relation's scalar FK column (e.g. `courseId`) is renamed to
//     the old ref field name (`course`) when the relation wasn't `include`d
//     (mirroring an un-populated Mongoose ref, which is just the raw id);
//     when it WAS included, the FK column is dropped and the nested object
//     takes that same field name (mirroring `.populate()`).
//   - Payment's flattened `receipt*`/`orderSnapshot*` columns are folded back
//     into nested `receipt: {...}` / `orderSnapshot: {...}` objects, and the
//     three `razorpay*` columns are renamed back to their snake_case names.

function foldRelations(row, mapping) {
  const out = { ...row };
  for (const [fk, ref] of Object.entries(mapping)) {
    if (out[ref] !== undefined) {
      delete out[fk];
    } else if (out[fk] !== undefined) {
      out[ref] = out[fk];
      delete out[fk];
    }
  }
  return out;
}

function idsToUnderscoreId(value) {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(idsToUnderscoreId);
  if (typeof value !== "object") return value;

  const { id, ...rest } = value;
  const out = id !== undefined ? { _id: id, ...rest } : { ...rest };
  for (const key of Object.keys(out)) {
    if (out[key] && typeof out[key] === "object") {
      out[key] = idsToUnderscoreId(out[key]);
    }
  }
  return out;
}

const REF_MAPS = {
  lecture: { courseId: "course" },
  video: { courseId: "course" },
  enrollment: { userId: "user", courseId: "course", paymentId: "payment" },
  application: { paymentId: "payment", userId: "user", courseId: "course" },
  payment: { applicationId: "application", userId: "user", courseId: "course" },
};

function serialize(row, refMapKey) {
  if (row == null) return row;
  if (Array.isArray(row)) return row.map((r) => serialize(r, refMapKey));
  const mapping = refMapKey ? REF_MAPS[refMapKey] : null;
  const folded = mapping ? foldRelations(row, mapping) : row;
  return idsToUnderscoreId(folded);
}

function serializePayment(payment) {
  if (payment == null) return payment;
  if (Array.isArray(payment)) return payment.map(serializePayment);

  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    orderSnapshotBasePrice,
    orderSnapshotDiscountPercent,
    receiptNumber,
    receiptIssuedAt,
    receiptBuyerName,
    receiptBuyerEmail,
    receiptBuyerPhone,
    receiptItemType,
    receiptItemTitle,
    receiptBasePrice,
    receiptDiscountPercent,
    receiptDiscountAmount,
    receiptTotalPaid,
    receiptPaymentMode,
    ...rest
  } = payment;

  const reshaped = {
    ...rest,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId ?? null,
    razorpay_signature: razorpaySignature ?? null,
    orderSnapshot: {
      basePrice: orderSnapshotBasePrice ?? null,
      discountPercent: orderSnapshotDiscountPercent ?? null,
    },
    receipt: {
      number: receiptNumber ?? null,
      issuedAt: receiptIssuedAt ?? null,
      buyerName: receiptBuyerName,
      buyerEmail: receiptBuyerEmail,
      buyerPhone: receiptBuyerPhone,
      itemType: receiptItemType ?? null,
      itemTitle: receiptItemTitle,
      basePrice: receiptBasePrice,
      discountPercent: receiptDiscountPercent,
      discountAmount: receiptDiscountAmount,
      totalPaid: receiptTotalPaid,
      paymentMode: receiptPaymentMode,
    },
  };

  return serialize(reshaped, "payment");
}

module.exports = { serialize, serializePayment };
