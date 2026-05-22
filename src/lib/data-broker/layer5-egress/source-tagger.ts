import { DataPacket } from "../schemas/data-packet";

export function tagSources(packets: DataPacket[]): DataPacket[] {
  return packets.map((packet) => ({
    ...packet,
    retrieved_at: packet.retrieved_at || new Date().toISOString(),
  }));
}
