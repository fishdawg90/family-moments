export type ProfileId = string;
export interface Attachment {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  name: string;
  mime: string;
  size: number;
  path: string;
  hash: string;
  remote: boolean;
}
export interface Moment {
  id: string;
  profileId: ProfileId;
  text: string;
  tagIds: string[];
  eventAt: string;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  updatedByUid: string;
  revision: number;
  attachments: Attachment[];
  deletedAt: string | null;
  schemaVersion: 1;
  lastOpId: string;
  cloudUpdatedAt?: number;
}
export interface LocalMoment {
  uid: string;
  id: string;
  value: Moment;
  baseRevision: number;
  opId: string;
  status: 'pending' | 'synced' | 'conflict';
  error: string;
  conflict: Moment | null;
}
export interface Tag {
  id: string;
  label: string;
  canonical: string;
}
export interface LocalTag {
  uid: string;
  id: string;
  value: Tag;
  pending: boolean;
}
export interface Draft {
  uid: string;
  profileId: string;
  text: string;
  tagIds: string[];
  eventAt: string;
  attachments: Attachment[];
  editingId: string | null;
}
export interface Media {
  uid: string;
  hash: string;
  blob: Blob;
}
export interface Cleanup {
  uid: string;
  path: string;
  momentId: string;
  notBefore: number;
}
export interface BackupSnapshot {
  uid: string;
  id: string;
  at: string;
  records: Record<string, string>;
  media: string[];
}
export interface BackupObject {
  uid: string;
  hash: string;
  blob: Blob;
}
