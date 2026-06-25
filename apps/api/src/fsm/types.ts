export interface IncomingMessage {
  from: string;
  type: "text" | "image" | "interactive";
  text?: string;
  imageId?: string;
  buttonId?: string;
}
