import { AssemblyStation } from "./utils/types/AssemblyStation";
import { Warehouse } from "./utils/LogisticControler/Warehouse";
import { Operation } from "./utils/Product";
import { Stage } from "konva/types/Stage";
import { AssemblyJob } from "./utils/types/AssemblyJob";

export class HasKonvaStage {
    konvaStage: Stage | null = null

    /**
     * Register konva stage
     * @param stage
     */
    registerKonvaStage(stage: Stage) {
        this.konvaStage = stage
    }
}

type Job = [number, number]
type EarliestDeadline = [number, number];
type ProbableDeadline = [number, number];

const jobs : {[key:string]:Job} = {}
const deadlinesEarliest:{[key:string]:EarliestDeadline} = {}
const deadlinesProbable:{[key:string]:ProbableDeadline} = {}




job.materialNeededOperationsList.forEach(operation => {
    const { id,earliestPosition, LatestPosition,  earliestTime, earliestPercentage, latestTime, latestPercentage } = operation;
    jobs[id] = [earliestPosition, LatestPosition]
    deadlinesEarliest[id] = [earliestTime, earliestPercentage];
    deadlinesProbable[id] = [latestTime, latestPercentage];

});






/*const jobs: { [key: string]: Job } = {
    'job1': [2, 5], 'job2': [1, 4], 'job3': [3, 6], 'job4': [5, 8],
    'job5': [4, 11], 'job6': [4, 9], 'job7': [6, 10], 'job8': [8, 12],
    'job9': [4, 6], 'job10': [7, 14], 'job11': [6, 12], 'job12': [4, 14],
    'job13': [7, 11], 'job14': [10, 17], 'job15': [2, 7], 'job16': [5, 11],
    'job17': [3, 13], 'job18': [8, 15], 'job19': [1, 9], 'job20': [9, 16]
};

const deadlinesEarliest: { [key: string]: Deadline } = {
    'job1': [7, 0.58], 'job2': [5, 0.32], 'job3': [9, 0.74], 'job4': [12, 0.19],
    'job5': [15, 0.49], 'job6': [16, 0.85], 'job7': [14, 0.66], 'job8': [12, 0.21],
    'job9': [8, 0.47], 'job10': [17, 0.93], 'job11': [17, 0.62], 'job12': [18, 0.38],
    'job13': [6, 0.57], 'job14': [19, 0.46], 'job15': [10, 0.81], 'job16': [21, 0.29],
    'job17': [8, 0.77], 'job18': [20, 0.34], 'job19': [7, 0.92], 'job20': [11, 0.51]
};

const deadlinesProbable: { [key: string]: Deadline } = {
    'job1': [9, 0.79], 'job2': [10, 0.50], 'job3': [13, 0.94], 'job4': [17, 0.79],
    'job5': [16, 0.73], 'job6': [20, 0.88], 'job7': [16, 0.85], 'job8': [13, 0.51],
    'job9': [9, 0.74], 'job10': [18, 0.95], 'job11': [21, 0.97], 'job12': [21, 0.98],
    'job13': [11, 0.66], 'job14': [24, 0.87], 'job15': [14, 0.87], 'job16': [23, 0.89],
    'job17': [9, 0.95], 'job18': [22, 0.76], 'job19': [12, 0.99], 'job20': [14, 0.87]
};
*/
const N_AGV = 5;
const R = 1;
const P = 7;
const B = 20;

type AGVDetails = {
    [key: string]: Array<Array<any>>;
};

function runPermutations(
    toAssign: string[],
    assigned: string[],
    deadlinesPrimary: { [key: string]: Deadline },
    agvs: AGVDetails,
    R_Factor: number,
    B_Factor: number
): any[] {
    const bestPermutations: any[] = [];
    const previousWeightedDelays = new Set<number>();
    const permutationsList = permutations(toAssign);

    for (const perm of permutationsList) {
        const agvsPerm: AGVDetails = JSON.parse(JSON.stringify(agvs));
        for (const job of perm) {
            let emptyAgv = false;
            let earliestFinish = 0;
            let selectedAgv: string | null = null;
            for (const [agv, details] of Object.entries(agvsPerm)) {
                if (details.length === 0) {
                    selectedAgv = agv;
                    emptyAgv = true;
                } else if (selectedAgv === null) {
                    earliestFinish = details[details.length - 1][7];
                    selectedAgv = agv;
                } else if (details[details.length - 1][7] < earliestFinish) {
                    earliestFinish = details[details.length - 1][7];
                    selectedAgv = agv;
                }
            }
            agvsPerm[selectedAgv!].push([]);
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(job);
            const processTime = R_Factor * jobs[job][1] + jobs[job][0] * (1 - R_Factor);
            if (emptyAgv) agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(0);
            else agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 2][7]);
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(processTime);
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1][1] + processTime);
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(deadlinesPrimary[job][0]);
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1][1] + processTime - deadlinesPrimary[job][0]);
            const weightedDifference = Math.round(agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1][5] * deadlinesPrimary[job][1] * 100000) / 100000;
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(weightedDifference);
            agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1].push(agvsPerm[selectedAgv!][agvsPerm[selectedAgv!].length - 1][1] + processTime * 2);
        }

        let delay = 0;
        let weightedDelayPerm = 0;
        const duration = new Set<number>();
        for (const details of Object.values(agvsPerm)) {
            for (const job of details) {
                weightedDelayPerm += job[6];
                delay += job[5];
            }
            duration.add(details[details.length - 1][7]);
        }
        const maxDuration = Math.max(...duration);

        if (previousWeightedDelays.size === 0) {
            previousWeightedDelays.add(weightedDelayPerm);
        } else if (weightedDelayPerm > Math.min(...previousWeightedDelays)) continue;

        const jobOrder = [...assigned, ...perm];
        bestPermutations.push([jobOrder, agvsPerm, delay, Math.round(weightedDelayPerm * 1000) / 1000, maxDuration]);

        bestPermutations.sort((a, b) => a[3] - b[3] || a[4] - b[4]);
    }

    return bestPermutations.slice(0, B_Factor);
}

function robustSchedule(
    jobs: { [key: string]: Job },
    deadlinesPrimary: { [key: string]: Deadline },
    deadlinesSecondary: { [key: string]: Deadline },
    N_AGV: number,
    R_Factor: number,
    P_Factor: number,
    B_Factor: number
): any[] {
    const allCombinations: any[] = [];
    const sortedJobs = Object.keys(deadlinesSecondary).sort((a, b) => deadlinesSecondary[a][0] - deadlinesSecondary[b][0]);

    const agvs: AGVDetails = {};
    for (let i = 0; i < N_AGV; i++) {
        agvs[`AGV ${i + 1}`] = [];
        agvs[`AGV ${i + 1}`].push([]);
        const processTime = R_Factor * jobs[sortedJobs[i]][1] + jobs[sortedJobs[i]][0] * (1 - R_Factor);
        agvs[`AGV ${i + 1}`][0].push(sortedJobs[i], 0, processTime, processTime, deadlinesSecondary[sortedJobs[i]][0], processTime - deadlinesPrimary[sortedJobs[i]][0]);
        const weightedDifference = Math.round((processTime - deadlinesPrimary[sortedJobs[i]][0]) * deadlinesPrimary[sortedJobs[i]][1] * 10000) / 10000;
        agvs[`AGV ${i + 1}`][0].push(weightedDifference, processTime * 2);
    }

    const intervalsToAssign: string[][] = [];
    const nIntervals = Math.ceil((sortedJobs.length - N_AGV) / P_Factor);
    for (let i = 0; i < nIntervals; i++) {
        const start = N_AGV + i * P_Factor;
        const end = start + P_Factor;
        intervalsToAssign.push(sortedJobs.slice(start, end));
    }

    for (const interval of intervalsToAssign) {
        if (interval === intervalsToAssign[0]) {
            allCombinations.push(...runPermutations(interval, sortedJobs.slice(0, N_AGV), deadlinesPrimary, agvs, R_Factor, B_Factor));
        } else {
            const runningCombinations: any[] = [];
            for (const combination of allCombinations) {
                const generatedPermutations = runPermutations(interval, combination[0], deadlinesPrimary, combination[1], R_Factor, B_Factor);
                runningCombinations.push(...generatedPermutations);
            }
            allCombinations.splice(0, allCombinations.length, ...runningCombinations);
        }
    }

    return allCombinations;
}

function simulateCombination(
    jobOrder: string[],
    jobs: { [key: string]: Job },
    deadlinesSecondary: { [key: string]: Deadline },
    N_AGV: number,
    R_Factor: number
): any[] {
    const agvs: AGVDetails = {};
    for (let i = 0; i < N_AGV; i++) {
        agvs[`AGV ${i + 1}`] = [];
    }

    for (const job of jobOrder) {
        let emptyAgv = false;
        let earliestFinish = 0;
        let selectedAgv: string | null = null;
        for (const [agv, details] of Object.entries(agvs)) {
            if (details.length === 0) {
                selectedAgv = agv;
                emptyAgv = true;
            } else if (selectedAgv === null) {
                earliestFinish = details[details.length - 1][6];
                selectedAgv = agv;
            } else if (details[details.length - 1][6] < earliestFinish) {
                earliestFinish = details[details.length - 1][6];
                selectedAgv = agv;
            }
        }
        agvs[selectedAgv!].push([]);
        agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(job);
        const processTime = R_Factor * jobs[job][1] + jobs[job][0] * (1 - R_Factor);
        if (emptyAgv) agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(0);
        else agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(agvs[selectedAgv!][agvs[selectedAgv!].length - 2][6]);
        agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(processTime);
        agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(agvs[selectedAgv!][agvs[selectedAgv!].length - 1][1] + processTime);
        agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(deadlinesSecondary[job][0]);
        agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(agvs[selectedAgv!][agvs[selectedAgv!].length - 1][1] + processTime - deadlinesSecondary[job][0]);
        agvs[selectedAgv!][agvs[selectedAgv!].length - 1].push(agvs[selectedAgv!][agvs[selectedAgv!].length - 1][1] + processTime * 2);
    }

    let delay = 0;
    const duration = new Set<number>();
    for (const details of Object.values(agvs)) {
        for (const job of details) {
            delay += job[5];
        }
        duration.add(details[details.length - 1][6]);
    }
    const maxDuration = Math.max(...duration);

    return [jobOrder, agvs, delay, maxDuration];
}

function* permutations(array: string[]): IterableIterator<string[]> {
    if (array.length === 1) {
        yield array;
    } else {
        const [first, ...rest] = array;
        for (const perm of permutations(rest)) {
            for (let i = 0; i < array.length; i++) {
                const start = perm.slice(0, i);
                const end = perm.slice(i);
                yield [...start, first, ...end];
            }
        }
    }
}

const combinations = robustSchedule(jobs, deadlinesEarliest, deadlinesProbable, N_AGV, R, P, B).sort((a, b) => a[3] - b[3] || a[4] - b[4]);

for (const combo of combinations) {
    console.log('Job Order:', combo[0]);
    for (const [agv, details] of Object.entries(combo[1])) {
        console.log(`${agv}:`, details);
    }
    console.log('Total Delay:', combo[2]);
    console.log('Most probable delay:', simulateCombination(combo[0], jobs, deadlinesProbable, N_AGV, R)[2]);
    console.log('Total weighted delay:', combo[3]);
    console.log('Duration:', combo[4], '\n');
}
