import { describe, expect, it } from "vitest";
import { scheduleConflictResult } from "../../supabase/functions/_shared/evaluationConflicts";
describe("conflict response contract", () => {
  it("accepts explicit empty results",()=>expect(scheduleConflictResult({ duplicate:null, conflict:null })).toEqual({}));
  it.each([null,{}, {duplicate:null}, {duplicate:undefined,conflict:null},
    {duplicate:{evaluation_id:"a",scheduled_at:"invalid"},conflict:null},
    {duplicate:null,conflict:{evaluation_id:"a",scheduled_at:"2090-01-01T12:00:00Z"}}])("fails closed on malformed data %j",value=>{
    expect(()=>scheduleConflictResult(value)).toThrow("inválida");
  });
});
