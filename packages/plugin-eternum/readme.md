# Eternum Plugin

## Overview

The idea here is that we provide the agent with context about the game:

1. Decide Task
2. Decide Action
3. Execute Action

### Runtime

Each of these steps could themselves be a few steps, this is very rough.

Look at [eternum/src/provider/index.ts](./eternum/src/provider/index.ts) for rough example of how the messages could
work.

_Query 1:_

1. Look at goal, state of realm. So resource balances, buildings etc (this is fetched from a DB right?)
2. Decide what information is needed for the context. (this is done by an LLM?) Create a graphql query for it, and fetch the information. Keep in
   context.
3. Decide if you want to take an action or not. (we have a list of actions defined in the same way as eliza?)

    - If not, return and ask question again in 1 minute
    - If yes, continue to Query 2

_Query 2:_

1. Pass context from Query 1 into another lookup to find how to take that action.
2. consume the cache of available actions
   (wouldn't this be redundant if we have actions defined in the Eliza way?)

_Execute 3:_

1. Take an action or not.

if success -> save memory

Repeat

### TODO:

1. Create file will all available actions formatted calldata. Don't we already have that in the EternumProvider? Or do
   you mean Eliza actions?

-   Add TypeDoc to all the Providers. In the example of the typedoc include formatted call data.
-   Write a script to extract only the typedoc information and save it to a file. This is what we will cache in the db. We
    need to be able to run this again so making a helper function is the key

2. Get all graphql models in a cache somehow. The entire generated files are too big. We need to compress the
   information of the available queries just enough that the model will still understand it.

3. Write Action that runs like the above. We just want everything encapsulated within that one ACTION for gameplay.
