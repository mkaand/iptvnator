import { runPhase5bAcceptance } from './phase5b-packaged-functional-acceptance';

const requestedMode = process.argv[2];
if (
    requestedMode !== undefined &&
    requestedMode !== 'broad' &&
    requestedMode !== 'current' &&
    requestedMode !== 'compare'
) {
    throw new Error('phase5-mode-must-be-broad-current-or-compare');
}

console.error(
    `[phase5] Redirecting ${requestedMode ?? 'default'} to the hardened broad-vs-legacy Phase 5B workflow.`
);

void runPhase5bAcceptance('compare').catch((failure: unknown) => {
    console.error(
        JSON.stringify(
            {
                error:
                    failure instanceof Error
                        ? failure.message
                        : String(failure),
                phase5b: (failure as { phase5b?: unknown })?.phase5b,
            },
            null,
            2
        )
    );
    process.exitCode = 1;
});
