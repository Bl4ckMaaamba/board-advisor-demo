import { DataPacket } from "../../schemas/data-packet";

export interface ResponseNormalizer<TRaw = unknown> {
  normalize(raw: TRaw, queryId: string): DataPacket[];
}
