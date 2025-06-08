export interface Session {
    userId: number;
    role: string;
    email: string;
    name: string;
    expires: Date;
}
