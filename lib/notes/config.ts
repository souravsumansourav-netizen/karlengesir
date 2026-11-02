export type NotesDeletePolicy = "anyone" | "owner_or_admin" | "admin_only";

/**
 * Global deletion policy for the Notes Board.
 * - "anyone": Anyone can delete any note without authentication (current default).
 * - "owner_or_admin": Only note creators or admins can delete (structured for future extension).
 * - "admin_only": Only verified administrators can delete (structured for future extension).
 */
export const NOTES_DELETE_POLICY: NotesDeletePolicy = "anyone";
