# Planning Queue

This is the queue the research agent reads. When you have a thought, idea, or question about Unusonic — add it to `## Active` below. The research agent picks the top unchecked item each time it fires.

**How to add a question from anywhere:**
- **At your desk:** edit this file, commit, push.
- **From your phone:** GitHub's mobile web UI lets you edit files directly. Open `planning-queue.md` on github.com, tap the pencil, add a line, commit.
- **Email/text to yourself:** capture the idea somehow, paste in next time you're at the desk.

**Good question shape:**
- Specific enough to produce a decision or a concrete next step
- Narrow enough that research can finish in one run
- Include any context the agent needs: docs to reference, files to look at, inspiration sources

**Bad question shape:**
- "Make Unusonic better" (too vague)
- "Rebuild the Aion system" (too big — ask for the NEXT step instead)
- "Fix everything in crm/" (that's an audit, not research)

---

## Active

---

## Done

- [x] 2026-04-19 **Seed question — feel free to replace.** Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice. — see PR
