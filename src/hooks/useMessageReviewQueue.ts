import { useQuery } from "@tanstack/react-query";
import { fetchMessageReviewQueue } from "@/lib/messageReviewQueue";

export function useMessageReviewQueue(studentIds: string[]) {
  const ids = [...studentIds].sort();
  return useQuery({
    queryKey: ["message-review-queue", ids],
    queryFn: () => fetchMessageReviewQueue(ids),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
}
