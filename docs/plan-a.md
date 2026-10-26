The workflow gate is the checkpoint that keeps a `grok_workflow` run from being reported as done on the strength of a worker's own claim.
It separates execution from verification: planners decompose the objective, workers carry out independent tasks, and a fresh verifier then checks every acceptance criterion against real evidence.
A run passes the gate only when each criterion is independently confirmed, so an unverified or failed check yields an honest partial or failed result instead of a false completion.
