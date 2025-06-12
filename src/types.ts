export interface Session {
    userId: number;
    role: string;
    email: string;
    name: string;
    expires: Date;
}

export interface Meeting {
    id: number;
    room_id: number;
    host_id: number;
    start_time: string; // ISO 8601 format
    end_time: string;   // ISO 8601 format
    description: string; // Made description mandatory, removed status
    created_at?: string; // ISO 8601 format
    room_name?: string; // Optional: For convenience when displaying meeting info
    host_name?: string; // Optional
    attendees?: MeetingAttendee[]; // Populated in specific queries
}

export interface MeetingAttendee {
    id: number;
    meeting_id: number;
    user_id: number;
    status: 'accepted' | 'declined' | 'tentative' | 'none';
}
