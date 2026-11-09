// Saving and deleting expenses on this device: writes the record, the receipt blob and the sync queue.
import { shrinkImage } from "./image.js";

export function createExpenses({ store, deviceId, onSaved = () => {} }) {
  const nextStamp = prev => Math.max(Date.now(), (prev || 0) + 1);

  /**
   * fields: {date, vendor, amountCents, category, payment, items, purpose, noReceipt, noReceiptReason}
   * opts: {existing?, file?, removeReceipt?}
   */
  async function save(fields, { existing, file, removeReceipt } = {}) {
    const id = existing ? existing.id : crypto.randomUUID();
    const [y, m] = fields.date.split("-").map(Number);
    let receipt = existing ? existing.receipt || null : null;
    const trash = [];
    let upload = false;
    let dropPendingUpload = false;

    if (file || removeReceipt) {
      if (receipt && receipt.driveId) trash.push(receipt.driveId);
      if (file) {
        const blob = await shrinkImage(file);
        await store.putBlob(id, blob);
        receipt = { driveId: null, name: null, type: blob.type || file.type || "application/octet-stream", localId: crypto.randomUUID() };
        upload = true;
      } else {
        await store.deleteBlob(id);
        receipt = null;
        dropPendingUpload = true;
      }
    }

    const record = {
      ...fields,
      id, year: y, month: m,
      receipt,
      noReceipt: !receipt && !!fields.noReceipt,
      noReceiptReason: !receipt && fields.noReceipt ? fields.noReceiptReason || "" : "",
      deleted: false,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: nextStamp(existing && existing.updatedAt),
      deviceId,
    };
    const seq = crypto.randomUUID();
    await store.patch(id, (_, prev) => ({
      rec: record,
      q: {
        id, seq,
        needsRecord: true,
        needsReceiptUpload: upload || (!dropPendingUpload && !!(prev && prev.needsReceiptUpload)),
        receiptToTrash: [...(prev ? prev.receiptToTrash : []), ...trash],
      },
    }));
    onSaved(record);
    return record;
  }

  async function remove(existing) {
    const trash = existing.receipt && existing.receipt.driveId ? [existing.receipt.driveId] : [];
    const tomb = { ...existing, deleted: true, updatedAt: nextStamp(existing.updatedAt), deviceId };
    await store.deleteBlob(existing.id);
    await store.patch(existing.id, (_, prev) => ({
      rec: tomb,
      q: { id: existing.id, seq: crypto.randomUUID(), needsRecord: true, needsReceiptUpload: false, receiptToTrash: [...(prev ? prev.receiptToTrash : []), ...trash] },
    }));
    onSaved(tomb);
    return tomb;
  }

  return { save, remove };
}
