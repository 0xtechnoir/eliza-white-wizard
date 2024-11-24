// TODO: Implement this for Starknet.
// It should just transfer tokens from the agent's wallet to the recipient.

import {
    ActionExample,
    elizaLogger,
    generateObject,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    type Action,
} from "@ai16z/eliza";
import { validateStarknetConfig } from "../enviroment";
import { EternumState } from "../types";
import { composeContext } from "../utils";
import { defineSteps, stepTemplate } from "../utils/execute";
import {
    AVAILABLE_ACTIONS,
    AVAILABLE_QUERIES,
    GAME_DESCRIPTION,
    WORLD_STATE,
} from "./dummy";

interface Step {
    name: string;
    reasoning: string;
}

interface StepsContent {
    steps: Array<Step>;
}

export default {
    name: "GENERATE",
    similes: ["GAME_ACTION"],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating Starknet configuration...");
        await validateStarknetConfig(runtime);
        elizaLogger.success("Starknet configuration validated successfully");
        return true;
    },
    description: `If a user asks you to do something that is related to this ${GAME_DESCRIPTION}, use this action to generate a plan to do it.`,
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: EternumState,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting GENERATE handler...");
        elizaLogger.log(`Processing message ID: ${message.id}`);

        // Initialize or update state
        elizaLogger.log("Initializing/updating state...");
        if (!state) {
            elizaLogger.log("No existing state found, creating new state");
            state = (await runtime.composeState(message, {
                gameDescription: GAME_DESCRIPTION,
                worldState: WORLD_STATE,
                queriesAvailable: AVAILABLE_QUERIES,
                availableActions: AVAILABLE_ACTIONS,
            })) as EternumState;
            elizaLogger.success("New state created successfully");
        } else {
            elizaLogger.log("Updating existing state");
            state = (await runtime.updateRecentMessageState(state, {
                gameDescription: GAME_DESCRIPTION,
                worldState: WORLD_STATE,
                queriesAvailable: AVAILABLE_QUERIES,
                availableActions: AVAILABLE_ACTIONS,
                currentHighLevelGoal: message.content.text,
            })) as EternumState;
            // elizaLogger.success("State updated successfully", state);
        }

        const handleStepError = (step: string) => {
            elizaLogger.error(`Error generating ${step} content`);
            elizaLogger.error(`Step execution failed at: ${step}`);
            if (callback) {
                elizaLogger.log("Executing error callback");
                callback({
                    text: "Unable to process transfer request",
                    content: {
                        worldState: state.worldState,
                        error: `Failed during ${step} step`,
                    },
                });
            }
            return true;
        };

        // First, get the steps from the model
        elizaLogger.log("Generating initial steps...");
        const context = composeContext({
            state,
            template: defineSteps,
        });

        // elizaLogger.log("Context composed, generating content...", context);
        const stepsContent: StepsContent = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.MEDIUM,
        });

        elizaLogger.log("stepsContent", JSON.stringify(stepsContent, null, 2));
        if (!stepsContent) {
            elizaLogger.error("Failed to generate steps content");
            return handleStepError("steps definition");
        }

        // Parse the steps returned by the model
        let modelDefinedSteps: Array<{
            name: string;
            template: string;
        }>;

        const generateStep = async (
            step: Step,
            state: EternumState
        ): Promise<
            | {
                  actionType: "invoke" | "query";
                  data: string;
                  nextStep: Step;
              }
            | boolean
        > => {
            elizaLogger.log(
                `Generating step with template: ${step.name.substring(0, 100)}...`
            );

            const context = composeContext({
                state,
                template: stepTemplate,
            });

            // elizaLogger.log("Context composed, generating content...", context);
            const content = await generateObject({
                runtime,
                context,
                modelClass: ModelClass.MEDIUM,
            });
            // elizaLogger.success("Step content generated successfully", content);

            return content;
        };

        try {
            if (!Array.isArray(stepsContent)) {
                throw new Error("Steps must be an array");
            }
        } catch (e) {
            elizaLogger.error("Failed to parse steps:", e);
            return handleStepError("steps parsing");
        }

        state = (await runtime.composeState(message, {
            ...state,
            allSteps: [...stepsContent],
            currentStepTitle: stepsContent[0].name,
            currentStepReasoning: stepsContent[0].reasoning,
        })) as EternumState;

        // Execute each step
        let currentSteps = [...stepsContent];
        let stepIndex = 0;

        // Execute steps dynamically
        elizaLogger.log("Beginning step execution...");
        while (stepIndex < currentSteps.length) {
            const step = currentSteps[stepIndex];
            elizaLogger.log(`Executing step: ${step.name}`);
            const content = await generateStep(step, state);

            elizaLogger.log("content", JSON.stringify(content, null, 2));

            let output: string = "";

            if (!content) {
                elizaLogger.error(
                    `Step ${step.name} failed to generate content`
                );
                return handleStepError(step.name);
            }

            // Process action type and get output
            if (typeof content === "object" && "actionType" in content) {
                if (content.actionType === "invoke") {
                    elizaLogger.log("Invoking action...");
                    output = "Successfully invoked action: " + content.data;
                } else if (content.actionType === "query") {
                    elizaLogger.log("Querying...");
                    output = "Successfully queried: " + content.data;
                }
            }

            // Handle next step insertion
            if (
                typeof content === "object" &&
                "nextStep" in content &&
                content.nextStep &&
                Object.keys(content.nextStep).length > 0
            ) {
                elizaLogger.log(
                    `Inserting next step after current step: ${step.name}`
                );
                const nextStepIndex = stepIndex + 1;
                if (
                    nextStepIndex >= currentSteps.length ||
                    currentSteps[nextStepIndex].name !== content.nextStep.name
                ) {
                    currentSteps.splice(stepIndex + 1, 0, content.nextStep);
                }
            }

            // Update state with current progress
            const nextStep = currentSteps[stepIndex + 1];

            console.log(currentSteps);
            state = (await runtime.composeState(message, {
                ...state,
                allSteps: currentSteps,
                currentStepTitle: nextStep?.name || null,
                currentStepReasoning: nextStep?.reasoning || null,
                output,
            })) as EternumState;

            elizaLogger.success(`Step ${step.name} completed successfully`);
            stepIndex++;
        }
        // TODO: After this happens we need to evaluate how the action went
        // and if it was successful or not. If it was succesful we should store it in memory as an action to do xyz. This way
        // we know this action works for the task.

        const handleStepSuccess = () => {
            elizaLogger.success(
                `Action completed successfully. Steps executed: ${JSON.stringify(currentSteps, null, 2)}`
            );
            if (callback) {
                elizaLogger.log("Executing success callback");
                callback({
                    text: "Action completed successfully",
                    content: {
                        worldState: state.worldState,
                        steps: modelDefinedSteps,
                    },
                });
            }
            return true;
        };

        return handleStepSuccess();
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Can you build me a Realm/house/castle/tower?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Sure thing! I'll get started on that right away.",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Buy me some gold?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Sure thing! I'll get started on that right away.",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
