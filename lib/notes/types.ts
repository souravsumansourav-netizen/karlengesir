export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NotesResponse {
  notes: Note[];
}

export interface NoteResponse {
  note: Note;
}

export interface NoteErrorResponse {
  error: string;
}
