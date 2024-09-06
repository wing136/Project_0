import {InternalTimeUnit, Manager} from "@/utils/Manager"
import {
    AssemblyStation,
    AssemblyStationOperation,
    QueuePosition
} from "@/utils/types/AssemblyStation"
import {Operation, Product} from "@/utils/Product"
import {v4 as uuid} from "uuid"
import {Stage} from "konva/types/Stage"
import {Coordinate} from "@/utils/types/GeometryTypes"
import Konva from "konva"
import {IFrame} from "konva/types/types"
import {getAngleBetweenPoints} from "@/utils/MathHelpers"
import {chassisWidth, sink} from "@/config"
// import  Strategy from "@/utils/ProductionStrategy"
import Normalisation from "@/utils/Normalisation"
import {AGVOperation, AGVEventType, AGVEventPayload, AGVStatus, AGV} from "@/utils/LogisticControler/AGVJob"; 
import {
    Warehouse,
    // WarehouseMaterial,
    // WarehouseEventPayload,
    // WarehouseEventType,
    WarehouseModule,
  } from "@/utils/LogisticControler/Warehouse"; 
import { Dictionary } from "./Dictionary"


export enum JobEventType {
    DISPATCHED = 'job:dispatched',
    STARTED_MOVING = 'job:started_movement',
    STOPPED_MOVING = 'job:stopped_movement',
    PROCESSING_STARTED = 'job:started_processing',
    ABORT = 'job:abort',
    ARRIVED = 'job:arrived_at_station',
    COMPLETED = 'job:completed',
    IN_STATION = 'job:in_station',
    OP_FOUND = 'operation_found',
    MATERIAL_NEEDS_CALCULATED = 'job_material_calculated',
    RECEIVED= 'warehouse_receive_List',
    MATERIAL_ARRIVED_WH= 'material_arrived_atWH_from_Lager'

}

export type JobEventPayload = {
    jobOperation: AssemblyJobOperation
    station: AssemblyStation
}

export enum JobStatus {
    WAITING = 'waiting',
    QUEUED = 'queued',
    MOVING = 'moving',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
}

/**
 * Key job metrics
 */
export type JobMetrics = {
    dispatchedAt: InternalTimeUnit | null
    completedAt: InternalTimeUnit | null
    transportTime: number
    workingTime: number
    workTime2: number
    workTime3: number
    waitingTime: number
    lastTime: number
    lastJobOperationFinishedAt: number //NW Output Monitoring
    lastEvent: string | null
    sequencesString: string
}

/**
 * Combination of an assembly job and an operation
 */
export type AssemblyJobOperation = {
    operation: Operation
    job: AssemblyJob
}

/**
 * Combination of an assembly job, AGV, assembly station and Warehouse
 */
export type PlannedAGVStationWarehouse = {
    agv: AGV
    station: AssemblyStation
    warehouse: Warehouse
}

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

interface Position extends Coordinate {
    angle: number
    flippedX?: boolean
    flippedY?: boolean
}
interface OperationCount {
    count: number;
    percentage: number;
    neededMaterial?: boolean;
    finishingTime?: number;
}

interface OperationCountByPosition {
    [operationName: string]: OperationCount;
}

interface OperationCounts {
    [position: number]: OperationCountByPosition;
}
interface OperationTimeInfo {
    time: number;
    probability?: number;
    earliestPosition?: number;
    latestPosition?: number;
}


interface MaterialNeededOperationInfo {
    earliestTime: number;
    earliestPercentage: number;
    latestTime?: number;
    latestPercentage?: number;
}



/**
 * Assembly order
 */
export class AssemblyJob extends HasKonvaStage {
    id: string
    product: Product
    status: JobStatus
    metrics: JobMetrics
    manager!: Manager
    completedOperations: Operation[] = []
    plannedJobOperation: AssemblyStationOperation | null = null
    plannedAGVStationWarehouse: PlannedAGVStationWarehouse | null = null
    usedStations: any[] = new Array()
    position: Position
    dueDate: number
    anim: Konva.Animation | null = null
    dispatchedAt: number | null = null
    completedAt: number | null = null
    transportTime: number = 0
    lastTime: number = 0
    workingTime: number = 0
    workTime2: number = 0
    workTime3: number = 0
    lastEvent: string | null = null
    waitingTime: number = 0
    lastJobOperationFinishedAt: number = 0 //NW Output Monitoring
    infeasible: boolean = false
    isRushJob: boolean = false
    // capacity dispatcher - GB
    valid:boolean = true //determines if it has passed constraints
    releaseScore: number = 10**10
    // demandOverTime: number[] = [] //tbd: would need to be operation specific.
    timelineSequences: string[][] = new Array() // GB - Capacity dispatcher
    sequences: Operation[][] = new Array() // AM - all Sequences
    timelineSequencesA: Operation[][] = new Array() // AM- timeline of sequences
    timelineSequencesB: Operation[][] = new Array() // GeBl - best Sequence
    limitedSequences: Operation[][] = new Array() // GeBl - chosen sequences from the limitation
    numberOfEvaluation: number = 0 //AM- number of evaluations
    sequencesArray: string []; //GeBl - array containing all completed operations
    sequencesString: string = '' //GeBl - string of all completed operations
    transportTest: number = 0; //GeBl - alternative way to calculate the transport time
    JobTotalTime: number = 0; //GeBl- total time of the Job
    JobStartTime: number = 0; //GeBl - starting time of the Job - used as an alternative to dispatchedAt due to type conflicts
    JobEndTime: number = 0; //GeBl - end time of the Job - used as an alternative to  completedAt due to type conflicts
    JobElseTime: number = 0; //GeBl - Time of the job that is not defined, i.e. when all queues are full but the job is dispatched and in the system
    materialArrived: boolean = false;
    selectedAGVId: string = "";
        /*
    New
    */
    matrizBinaria: string[][] = []
    Jobpredecessors: Operation[] = []
    operations: Operation[] = []
    depM: boolean[][]=[]
    nextSequences: Operation[][] =[]
    // operationCounts: { [position: number]: { [operationName: string]: { count: number; percentage: number; neededMaterial?: boolean; finishingTime?: number} } } = {};
    operationCounts: OperationCounts = {}
    firstTransportationTime: number = 0;
    map: Map<AssemblyStationOperation, number> = new Map()
    materialNeededOperationsList: Array<{name: string, earliestTime: number, earliestPercentage: number, latestTime?: number, latestPercentage?: number, id?:string}> = [];
    createlist: boolean = false;
    transportationTime: number = 0;
    PredictiveList: boolean = false;


    constructor(
        id: string | null,
        product: Product,
        position: Partial<Position> = {},
        dueDate: number,
        isRushJob: boolean = false
    ) {
        super()
        if (id === null) {
            id = uuid()
        }
        this.id = id
        this.product = product
        this.status = JobStatus.WAITING
        this.dueDate = dueDate
        this.isRushJob = isRushJob
        this.sequencesArray = []
        this.metrics = {
            dispatchedAt: null,
            completedAt: null,
            transportTime: 0,
            workingTime: 0,
            workTime2: 0,
            workTime3: 0,
            waitingTime: 0,
            lastTime: 0,
            lastEvent: null,
            lastJobOperationFinishedAt: 0, //NW Output Monitoring
            sequencesString: ''

        }
        this.position = {
            x: 0,
            y: 0,
            angle: 0,
            ...position
        }
    }

    /**
     * Get uncompleted operations
     */
    get uncompletedOperations(): Operation[] {
        return this.product.operations.filter(o => !this.completedOperations.includes(o))
    }

    /**
     * Get next possible operations
     * under consideration of precedence constraints
     */
    get nextOperations(): Operation[] {
        let nextOperations: Operation[] = []
        this.uncompletedOperations.forEach(o => {
            let operationIsPossible = true
            o.predecessors.filter(o => this.product.operations.includes(o)).forEach(p => {
                if (!this.completedOperations.includes(p)) {
                    operationIsPossible = false
                }
            })
            if (operationIsPossible) {
                nextOperations.push(o)
            }
        })
        return nextOperations
    }
    get transportTimeCalc(): number{

        if (this.plannedJobOperation !== undefined){
            let path = this.manager.router.getKonvaPath(this.position, this.plannedJobOperation!.station.origin)
            let transportationTime = this.manager.router.getTransportationDuration(path)
            return transportationTime

        } else {
            console.warn("error, no plannedJobOperation")
            return 0
        }
    }

    /**
     * Dispatch job
     */
    dispatch = async () => {
        this.dispatchedAt = this.manager.simulation.time
        this.JobStartTime = this.dispatchedAt
        this.prepareNextOperation().then()
    }

    /**
     * Set job status to queued
     */
    setQueued = () => {
        this.status = JobStatus.QUEUED
        this.lastEvent = "arrived"
        //console.log("The job is in station: " + this.inStation)
    }

    /**
     * Set job status to processing
     */
    setProcessing = () => {
        if (this.lastEvent === "processing") {
            this.workingTime += (this.manager.simulation.time - this.lastTime)
            this.lastTime = this.manager.simulation.time
        }
        if (this.lastEvent === "arrived") {
            this.waitingTime += (this.manager.simulation.time - this.lastTime)
            this.lastTime = this.manager.simulation.time
        }

        this.lastEvent = "processing"
        this.lastTime = this.manager.simulation.time
        this.manager.dispatchEvent(JobEventType.PROCESSING_STARTED, {job: this})
        this.status = JobStatus.PROCESSING
    }

    /**
     * Complete an operation
     * @param operation
     */
    completeOperation = async (operation: Operation) => {
        this.workTime2 += (operation.followUpTime + operation.setUpTime + operation.processingTime)
        this.workTime3 += operation.processingTime
        this.workingTime += (this.manager.simulation.time - this.lastTime)
        this.lastTime = this.manager.simulation.time
        this.completedOperations.splice(this.completedOperations.length, 0, operation)
        this.createStationHistory()
        //console.log("Alejandra completeOperation", this.id)
        this.prepareNextOperation().then()
        this.manager.removeSpecificOperationByJobId(this, operation.name)
        this.sequencesArray.push(operation.name)
        this.sequencesString += " " + operation.name +";";

    }

    /**
     * Create a Station History for each Job
     * 
     */
    createStationHistory = () => {
        if (this.plannedJobOperation !== null)
        this.usedStations.splice(this.usedStations.length, 0, this.plannedJobOperation.station.id)
        // console.log(this.usedStations)       
    }

    abort = async () => {
        if (!this.plannedJobOperation) {
            return
        }
        if (this.anim) {
            this.anim.stop()
        }
        let payload: JobEventPayload = {
            jobOperation: {
                job: this,
                operation: this.plannedJobOperation!.operation
            },
            station: this.plannedJobOperation!.station
        }
        this.manager.dispatchEvent(JobEventType.ABORT, payload)
        this.plannedJobOperation = null
        this.prepareNextOperation().then()
    }
    /**
     * Evaluate stations for next possible operations
     */
    findNextStation = () => {
        let function_time_start = this.manager.simulation.time
        // get capable stations from manager
        let jobOperations: AssemblyStationOperation[] = []
        this.nextOperations.forEach(operation => {
            let stations = this.manager.getCapableAssemblyStations(operation)
            stations = stations.filter(station => !station.disabled)
            //Handling of empty possible stations
            if (stations.length == 0){
                console.log('No target Station, because all free spaces are filled') //TODO Fehlerbehandlung? Oder reicht unlock Jobs?
            }

            stations.forEach(station => {
                jobOperations.push({station, operation})
            })
        })
        // normalisation transportation time
        let allTT: number = 1
        let countTT: number = 1
        jobOperations.forEach(({station, operation}) => {
            let path = this.manager.router.getKonvaPath(this.position, station.origin)
            let transportationTime = this.manager.router.getTransportationDuration(path)
            allTT += transportationTime
            countTT++
        })
        let nTT = allTT / countTT
        if (allTT == 0) {
            nTT = 1
        }

        //normalisation processing time
        let allPT: number = 0
        let countPT: number = 0
        jobOperations.forEach(({operation, station}) => {
            allPT += operation.processingTime
            countPT++
        })
        let nPT = allPT / countPT
        if (allPT == 0) {
            nPT = 1
        }

        //normalisation remaining station time
        let allStation: AssemblyStation[] = []
        let allRST: number = 0
        let countRST: number = 0
        jobOperations.forEach((obj) => {
            if(obj.hasOwnProperty('station')){
                allRST += Math.max(0, obj.station.expectedFinishTime - obj.station.manager.simulation.time)
                countRST++
            }
        })
        // allStation.forEach((station) => {
        //     allRST += Math.max(0, station.expectedFinishTime - station.manager.simulation.time)
        //     countRST++
        // })
        let nRST = allRST / countRST
        if (allRST == 0) {
            nRST = 1
        }
        
        //normalisation pD queued operations duration
        let allQOD: number = 0
        let countQOD: number = 0
        jobOperations.forEach((obj) => {
            if(obj.hasOwnProperty('station')){
                let aQOD: number
                allQOD += obj.station.queuedJobOperations.reduce((sum: number, jobOperation): number => {
                    let operation = jobOperation.operation
                    return sum += operation.setUpTime + operation.processingTime + operation.followUpTime
                }, 0)
        }
            countQOD++
        })
        // allStation.forEach((station) => {
        //     let aQOD: number
        //     allQOD += station.queuedJobOperations.reduce((sum: number, jobOperation): number => {
        //         let operation = jobOperation.operation
        //         return sum += operation.setUpTime + operation.processingTime + operation.followUpTime
        //     }, 0)
        //     countQOD++
        // })
        let nQOD = allQOD / countQOD
        if (allQOD == 0) {
            nQOD = 1
        }

        //Normalisation material supply time
        let nMS = 1
        let nextPossibleStations_AGVs : Map<AssemblyStation, {agv: AGV,warehouse:Warehouse, time:number}> = new Map() 
        if(this.manager.controlMaterialSupply === true){
            let allMS: number = 0
            let countMS: number = 0
            //Get the best time for material supply (consists of agv and warehouse) for each possible next station
            jobOperations.forEach(({station, operation}) => {
                //Get all free AGVs
                let free_agvs = this.manager.getAvailableAGVs(station)//parameter Assemblystation is given because the function needs it
                let warehouses_active = this.manager.warehouses;
                let minTime = Infinity;
                // Also check if the operation needs material. IF NOT, then material supply time is not going to be taken into account
                if(free_agvs.length >0 && operation.materialRequired == true){ //If there is at least ONE free AGV, continue. Otherwise nextPossibleStations_AGVs = undefined.
                    let selectedWarehouse = warehouses_active[0] //Select just one of the warehouses, the variable will be overwritten with the correct warehouse
                    let selectedAGV = free_agvs[0] //Select just one of the AGVs, the variable will be overwritten with the correct AGV
                    free_agvs.forEach((agv) =>{
                        let { warehouse_agv, time_materialSupply } = agv.getMaterialSupplyTime(warehouses_active, station);//For each AGV get the best route to the selected station (time to WH insclusive)
                        if (time_materialSupply < minTime) { //Get the warehouse and AGV with the minimal material supply time for each possible next station
                            minTime = time_materialSupply;
                            selectedWarehouse = warehouse_agv;
                            selectedAGV = agv;
                        }
                    })
                    
                    nextPossibleStations_AGVs.set(station,{agv:selectedAGV,warehouse:selectedWarehouse,time:minTime})
                } 
            })
            console.log("Control material suplly", countMS)

            let materialSupplyTime = 0
            //Normalisation for the material transport time in CONTROL MATERIAL SUPPLY. To calculate "nMS"
            jobOperations.forEach(({station, operation}) => {
                /* let maxStationTime = station.getMaxCompletionTimeFor(operation)
                */
                let path = this.manager.router.getKonvaPath(this.position, station.origin)
                let transportationTime = this.manager.router.getTransportationDuration(path)
                //alle folgenden vorher in maxStationTime
                let processingTime = operation.processingTime
                //folgende in AssemblyStation.ts berechnen?
                let remainingStationTime = Math.max(0, station.expectedFinishTime - station.manager.simulation.time)
                let queuedOperationsDuration = station.queuedJobOperations.reduce((sum: number, jobOperation): number => {
                    let operation = jobOperation.operation
                    return sum += operation.setUpTime + operation.processingTime + operation.followUpTime
                }, 0)

                let stationData = nextPossibleStations_AGVs.get(station) //If there is not a free AGV, then the material supply is not going to be taken into account. 
                if(stationData !== undefined){
                    materialSupplyTime = stationData.time - (transportationTime+remainingStationTime+queuedOperationsDuration)
                    if(materialSupplyTime<0){
                        materialSupplyTime=0
                    }
                }
                allMS += materialSupplyTime
                countMS++
            })


            nMS = allMS / countMS
            if (allMS == 0) {
                nMS = 1
            }
        }
                // ----- ENDING OF THE NORMALISATION ----- //



        if(this.manager.predictiveMaterialSupply === true){
                    let allMS: number = 0
                    let countMS: number = 0
                    //Get the best time for material supply (consists of agv and warehouse) for each possible next station
                    jobOperations.forEach(({station, operation}) => {
                        //Get all free AGVs
                        let free_agvs = this.manager.getAvailableAGVs(station)//parameter Assemblystation is given because the function needs it
                        
                        // Test to see the status
                        if (free_agvs.length == 0){
                            console.warn("null")
                            for (let agv of this.manager.activeAGVs){
                                console.log(agv.status)
                            }
                        }


                        let warehouses_active = this.manager.warehouses;
                        let minTime = Infinity;
                        // Also check if the operation needs material. IF NOT, then material supply time is not going to be taken into account
                        if(free_agvs.length >0 && operation.materialRequired == true){ //If there is at least ONE free AGV, continue. Otherwise nextPossibleStations_AGVs = undefined.
                            let selectedWarehouse = warehouses_active[0] //Select just one of the warehouses, the variable will be overwritten with the correct warehouse
                            let selectedAGV = free_agvs[0] //Select just one of the AGVs, the variable will be overwritten with the correct AGV
                            free_agvs.forEach((agv) =>{
                                //console.log("Material Supply for AGV:", agv.id)
                                console.log("Predictive MS is:", this.manager.predictiveMaterialSupply)
                                let { warehouse_agv, time_materialSupply } = agv.getMaterialSupplyTimePredictive(warehouses_active, station, operation, this);//For each AGV get the best route to the selected station (time to WH insclusive)
                                if (time_materialSupply < minTime) { //Get the warehouse and AGV with the minimal material supply time for each possible next station
                                    minTime = time_materialSupply;
                                    selectedWarehouse = warehouse_agv;
                                    selectedAGV = agv;
                                }
                            })
                            
                            nextPossibleStations_AGVs.set(station,{agv:selectedAGV,warehouse:selectedWarehouse,time:minTime})
                        } 
                    })
                    //console.log("Control material suplly", countMS)
        
                    
                    //Normalisation for the material transport time in CONTROL MATERIAL SUPPLY. To calculate "nMS"
                    jobOperations.forEach(({station, operation}) => {
                        /* let maxStationTime = station.getMaxCompletionTimeFor(operation)
                        */
                        let materialSupplyTime = 0
                        let path = this.manager.router.getKonvaPath(this.position, station.origin)
                        let transportationTime = this.manager.router.getTransportationDuration(path)
                        console.log("Transportation Time:", transportationTime, "OP + ST", station.id, operation.name)
                        //alle folgenden vorher in maxStationTime
                        let processingTime = operation.processingTime
                        console.log("ProcessingTime:", processingTime)
                        //folgende in AssemblyStation.ts berechnen?
                        let remainingStationTime = Math.max(0, station.expectedFinishTime - station.manager.simulation.time)
                        console.log("Remaining Station TIme: " + remainingStationTime)
                        let queuedOperationsDuration = station.queuedJobOperations.reduce((sum: number, jobOperation): number => {
                            let operation = jobOperation.operation
                            return sum += operation.setUpTime + operation.processingTime + operation.followUpTime
                        }, 0)
                        console.log("Queued Op Duration", queuedOperationsDuration)
        
                        let stationData = nextPossibleStations_AGVs.get(station) 
                        //If there is not a free AGV, then the material supply is not going to be taken into account. 
                        if(stationData !== undefined){
                            materialSupplyTime = stationData.time - (transportationTime+remainingStationTime+queuedOperationsDuration)
                            if(materialSupplyTime<0){
                                materialSupplyTime=0
                            }
                        }
                        allMS += materialSupplyTime
                        countMS++
        
                        console.log("Material Supply Time:",materialSupplyTime)
                    })
        
        
                    nMS = allMS / countMS
                    if (allMS == 0) {
                        nMS = 1
                    }
        }
        

        // calculate score for each station
        let scores: number[] = []
        let scoresMap = new Map();
        jobOperations.forEach(({station, operation}) => {
            /* let maxStationTime = station.getMaxCompletionTimeFor(operation)
            */
            console.log("Score Calculation for",station.id, " Operation Name:",operation.name)

            let path = this.manager.router.getKonvaPath(this.position, station.origin)
            let transportationTime = this.manager.router.getTransportationDuration(path)
            let processingTime = operation.processingTime
            let remainingStationTime = Math.max(0, station.expectedFinishTime - station.manager.simulation.time)
            let queuedOperationsDuration = station.queuedJobOperations.reduce((sum: number, jobOperation): number => {
                let operation = jobOperation.operation
                return sum += operation.setUpTime + operation.processingTime + operation.followUpTime
            }, 0)

            // Control Material supply OR Predictive Material Supply

             if(this.manager.controlMaterialSupply === true || this.manager.predictiveMaterialSupply === true){ //Only if is control material supply
                let materialSupplyTime = 0
                let stationData = nextPossibleStations_AGVs.get(station) //If there is not a free AGV, then the material supply is not going to be taken into account. 
                if(stationData !== undefined){
                    // console.log("xxxx materialSupplyTime before comparing", stationData.time)
                    materialSupplyTime = stationData.time - (transportationTime+remainingStationTime+queuedOperationsDuration)
                    if(materialSupplyTime<0){
                        materialSupplyTime=0
                    }
                    // console.log("xxxx materialSupplyTime", materialSupplyTime)
                }
    
                let total_norm_mart = transportationTime+processingTime+remainingStationTime+queuedOperationsDuration+materialSupplyTime
                let score = 1 / ((this.manager.strategy.pG*(materialSupplyTime/nMS)) + this.manager.strategy.pA * (transportationTime / nTT) + this.manager.strategy.pB * (processingTime / nPT) + (this.manager.strategy.pC /nRST)* remainingStationTime + this.manager.strategy.pD * (queuedOperationsDuration / nQOD))
                // let score = 1 / (this.manager.strategy.pG*(materialSupplyTime/total_norm_mart) + this.manager.strategy.pA * (transportationTime / total_norm_mart) + this.manager.strategy.pB * (processingTime / total_norm_mart) + (this.manager.strategy.pC /total_norm_mart)* remainingStationTime + this.manager.strategy.pD * (queuedOperationsDuration / total_norm_mart))
                scores.push(score)
                scoresMap.set(station,score)

            } else{ // If it is REACTIVE material supply or NO material supply
                let total_norm_mart = transportationTime+processingTime+remainingStationTime+queuedOperationsDuration
                let score = 1 / (this.manager.strategy.pA * (transportationTime / nTT) + this.manager.strategy.pB * (processingTime / nPT) + (this.manager.strategy.pC /nRST)* remainingStationTime + this.manager.strategy.pD * (queuedOperationsDuration / nQOD))
                // let score = 1 / (this.manager.strategy.pA * (transportationTime / total_norm_mart) + this.manager.strategy.pB * (processingTime / total_norm_mart) + (this.manager.strategy.pC /total_norm_mart)* remainingStationTime + this.manager.strategy.pD * (queuedOperationsDuration / total_norm_mart))
                scores.push(score)
                scoresMap.set(station,score)
            }
            // scores.push(score)
            // scoresMap.set(station,score)
        })
        // select best station
        let maxScore = Math.max(...scores)
        console.log("maxScore", maxScore)
        this.plannedJobOperation = jobOperations[scores.indexOf(maxScore)]
        this.transportTime = this.transportTimeCalc

        if(this.manager.controlMaterialSupply === true || this.manager.predictiveMaterialSupply === true){ //Only if it is CONTROL material supply OR REACTIVE Material Supply
            // Also check if the selected operation needs material. IF NOT, then there is no need for AGV
            if(this.plannedJobOperation && this.plannedJobOperation.operation.materialRequired==true){ // A next assembly station exists for the AssemblyJob
                let selectedStationData = nextPossibleStations_AGVs.get(this.plannedJobOperation.station)
                if(selectedStationData !== undefined){ // A free AGV exists for the material supply  
                    // Change status of the AGV because it is already reserved
                    selectedStationData.agv.status = AGVStatus.MOVING
                    selectedStationData.agv.metrics.dispatchedAt= this.manager.simulation.time//Chuye control
                    // selectedStationData.agv.metrics.dispatchedAt = this.manager.simulation.time

                    let selectedAgents = { agv: selectedStationData.agv, station: this.plannedJobOperation.station,warehouse: selectedStationData.warehouse}
                    //Give Information to the AssemblyJob of the selected combination of, agv, warehouse and assembly station
                    this.plannedAGVStationWarehouse = selectedAgents
                    console.log("Operacion escogida: ",this.plannedJobOperation.operation.name, "Station:",this.plannedJobOperation.station.id,  "AGV Id:", selectedAgents.agv.id, "Warehouse", selectedAgents.warehouse.id, "Supply Time:",selectedStationData.time)
                }else{
                    //In case there was one free AGV in the LAST prepareNextOperation() but in this is not.
                    this.plannedAGVStationWarehouse = null; 
                    // Add to the queue because there were no free AGVs. AsseblyJob_id and AssemblyStation to which material need to be dispatch
                    this.manager.materialJobExecutionQueue.set(this.id, new Map())
                    this.manager.materialJobExecutionQueue.get(this.id)?.set(this,this.plannedJobOperation.station)
                    console.log("There was not one free AGV while choosing the next station")
                }
            } else if(this.plannedJobOperation && this.plannedJobOperation.operation.materialRequired==false){
                this.materialArrived = true
                console.log("The Operation does not need Material. Operation Name:",this.plannedJobOperation.operation.name,"Material Arrived Variable set to *true*, Proof:",this.materialArrived)
            }
            let function_time_end = this.manager.simulation.time
            console.log("Control: zzzz time funtion control: ",function_time_start-function_time_end)
            //this.usedStations.splice(this.usedStations.length, 0, this.plannedJobOperation.station.id)
            // console.log(jobOperations[scores.indexOf(maxScore)])
        }
    }
    async findNextnextOperations(ope: Operation, stationfromOpe: AssemblyStation, plannedWH?:Warehouse){ // Posible change of name to findPredictiveOperations

        let nextnextOperations: Operation[] = []
        let completedOperationsCopy: Operation[] = []
        let uncompletedOperationsCopy = this.uncompletedOperations.slice()
       // let materialNeededOperationsTime: { [key: string]: OperationTimeInfo } = {};
        //NEW: Lista de las operationes que necesitan material y sus datos
        this.materialNeededOperationsList = [];
    
        if (ope !== undefined){
            // Agregamos la current operation a las "completed"
            completedOperationsCopy = [...this.completedOperations]
            completedOperationsCopy.push(ope)

            console.log(" ---findNextnextOperations Function--- ")
            console.log("Current", ope.name, "from:", String(this.id).substr(0,8), "Product:", this.product.name)

            // Eliminamos "ope" de las uncompleted
            let indexOpe = uncompletedOperationsCopy.indexOf(ope)
            uncompletedOperationsCopy.splice(indexOpe,1)

            //First Actualization of nextNextOperations

            uncompletedOperationsCopy.forEach(o => {
                    let operationIsPossible = true
                    o.predecessors.filter(o => this.product.operations.includes(o)).forEach(p => {
                        if (!completedOperationsCopy.includes(p)) {
                            operationIsPossible = false
                        }
                    })
                    if (operationIsPossible) {
                        nextnextOperations.push(o)
                    }
                })
               

                await this.generateSequences();

                //Test: To check that  the list is empty
                console.log("Test: Material Needed Operations List:", this.materialNeededOperationsList, "Job ID:", String(this.id).substr(0,8))
                
                // Calcula las posiciones de las operaciones que requieren material en las secuencias
                //console.log("Operations with material requirements:")
                this.calculateOperationPositions(ope, stationfromOpe, plannedWH) // aqui se calcula la lista de Operaciones que necesitan material y cuando [materialNeededOperationsList]
             
                console.log("Material Needed Operation list:", this.materialNeededOperationsList)
                
    
                this.manager.dispatchEvent(JobEventType.MATERIAL_NEEDS_CALCULATED, {
                    job:this,
                    materialNeeds: this.materialNeededOperationsList
                }, this.manager.simulation.time)
            
         
                                    








            } else {
                console.warn("Ope undefined")
            }

            this.createlist = true
            
        }
    async generateSequences() {
        this.getSequences2(this);
        this.analyzeSequences2(this);

        }
    getSequences2(assemblyJob: AssemblyJob){
        

        const pastOperations = [...assemblyJob.completedOperations]
    
            if (assemblyJob.plannedJobOperation) {                                    
                pastOperations.push(assemblyJob.plannedJobOperation.operation)  
               // console.log("Si hay una operation planeada")  
            }
    
            assemblyJob.nextSequences = []
            let currentSequence: Operation[][] = []
            currentSequence.push(pastOperations)
           // console.log("Past Operations:",pastOperations)
    
          //  console.log("Current Sequence = ")
           // console.log(currentSequence)
    
            let helpSequence: Operation[][] = []
            this.getNewLevel(currentSequence, assemblyJob.product, helpSequence)
            // console.log("Help Sequence (Based on the operations done)")
            // console.log(helpSequence)
    
            for (let hSeq of helpSequence){
                assemblyJob.nextSequences.push(hSeq.slice(pastOperations.length)) // Aqui se elimina las activeOperations y asi se crea la nueva matriz de secuencias
            }
    
            //console.log("Number of new sequences:",assemblyJob.nextSequences.length)
            
    
    
            
    
    
        }
    getNewLevel(currentSequences : Operation[][], product: Product, targetSequence : Operation[][]){

            //  console.log(product.name)
              for (let sequence of currentSequences){
                  let canOperation = this.getCanOperation(sequence, product)
                  
      
                 
      
                  //console.log(sequence)
      
                  /**
                   * Termination criterion if the arent any possible Operations left. It's marked as an empty array.
                   */
                  if (canOperation.length == 0){
                      // for (let x of sequence){
                      //     console.log(x.name)
                      // }
                      
                      targetSequence.push(sequence)
                      
                      
                      continue
                  }
                  /**
                   * Creation of an help Sequence with all new possibilities. The Programm is looking at one sequence
                   * from before and creates now all possible Sequences
                   */
                  let helpSequence:Operation[][] = []
                  for (let i=0; i < canOperation.length;i++){
                      helpSequence.push(sequence.slice())
                      helpSequence[i].push(canOperation[i])
                  }
                  /**
                   * The new Sequences are fed into the recursive method.
                   */
                  this.getNewLevel(helpSequence, product, targetSequence)
              
      
              }
        }
    getCanOperation(currentSequence: Operation[], product: Product) {
            /**
             * Initialize an array that holds the position of the operations that are already done, 
             * so map the current sequence to the matrix.
             */
    
            let canOperation: Operation[] = []
            let donePosition = [0]
            for (let step of currentSequence) {
                let p = product.operations.indexOf(step) + 1
                donePosition.push(p)
            }
            /**
             * Examinating the needed operations for every row of the matrix.
             */
           
            for (let i = 0; i < product.dependencyMatrice.length; i++) {
                let op = product.dependencyMatrice[i]
                let needOperationPos = []
                if (donePosition.includes(i + 1)){
                    continue
                }
                for (let j = 0; j < op.length; j++) {
                    if (op[j]) {
                        needOperationPos.push(j)
                    }
                }
                let possible = true
                for (let nop of needOperationPos) {
                    /**
                     * Check if all needed operations for the current row are already done.
                     */
                    if (!donePosition.includes(nop)) {
                        possible = false
                    }
                    /**
                     * Check if the current considered operation itself is already done.
                     */ // JA: This can be checked in the beginning. is already implemented-
                    /*if (currentSequence.includes(product.operations[i])) {
                        possible = false
                    }*/
                }
                /**
                 * If operation is still possible and is not matched to last row of the matrix ('finished' operation),
                 * add operation to the canOperation array.
                 */
                if (possible) {
                    if (i < product.dependencyMatrice.length - 1) {
                    canOperation.push(product.operations[i])
                    }
                }
            }
            /**
             * After checking every row of the matrix, so every oparation, return the array with all possible operations.
             */
            return canOperation
        }
    analyzeSequences2(assemblyJob: AssemblyJob){
            if (assemblyJob !== undefined) {
                let totalSequences = assemblyJob.nextSequences.length;
                let sequenceLength = assemblyJob.nextSequences[0].length;
        
                let tiempo: number | undefined = 0;
                if (assemblyJob.plannedJobOperation?.operation.totalTime !== undefined) {
                    tiempo = assemblyJob.plannedJobOperation.operation.totalTime + assemblyJob.lastTime;
                }
        
                // Inicializar un objeto de recuento para cada posición en la secuencia
                for (let i = 0; i < sequenceLength; i++) {
                    assemblyJob.operationCounts[i] = {};
                }
        
                
        
                // Contar la frecuencia de cada operación en cada posición de la secuencia
                for (let sequence of assemblyJob.nextSequences) {
                
               
        
                    for (let i = 0; i < sequenceLength; i++) {
                        let currentOperation = sequence[i];
                        let operationName = currentOperation.name;
        
                        assemblyJob.operationCounts[i][operationName] = assemblyJob.operationCounts[i][operationName] || {
                            count: 0,
                            percentage: 0,
                        };
                        assemblyJob.operationCounts[i][operationName].count += 1;
                        assemblyJob.operationCounts[i][operationName].neededMaterial = currentOperation.materialRequired;
        
                        // only the first entry has the value "time"
                        if (i === 0) {
                            assemblyJob.operationCounts[i][operationName].finishingTime = tiempo;
                        }
                    }
                }
        
                // Calculations and printing of the percentage of every operation in every position of the sequences
                for (let i = 0; i < sequenceLength; i++) {
                   // console.log(`Frequency at position #${i + 1}:`);
                    for (let operationName in assemblyJob.operationCounts[i]) {
                        if (assemblyJob.operationCounts[i].hasOwnProperty(operationName)) {
                            let { count } = assemblyJob.operationCounts[i][operationName];
                            let percentage = (count / totalSequences) * 100;
                            assemblyJob.operationCounts[i][operationName].percentage = percentage;
                            // console.log(
                            //     `- ${operationName}: ${percentage.toFixed(2)}% Needs Material?: ${
                            //         assemblyJob.operationCounts[i][operationName].neededMaterial
                            //     } Expected FT ${assemblyJob.operationCounts[i][operationName].finishingTime}`
                            // );
                        }
                    }
                   // console.log("\n"); // Separator between positions
                }
            }
        }

        
    calculateOperationPositions(plannedOp: Operation, station:AssemblyStation, warehouse?:Warehouse){
            const operationTimeInfo: { [key: string]: MaterialNeededOperationInfo } = {};
            const earliestPosition: { [key: string]: number } = {};
            const latestPosition: { [key: string]: number } = {};
            const operationsBeforeEarliest: { [key: string]: Operation[] } = {};
            const operationsBeforeLatest: { [key: string]: Operation[] } = {};
        
            this.nextSequences.forEach(sequence => {
                sequence.forEach((operation, index) => {
                    if (operation.materialRequired) {
                        // this checks that the operation si not already in earliestPosition and that the index is smaller than the earlist position
                        const isEarliest = earliestPosition[operation.name] === undefined || index < earliestPosition[operation.name]; // the operation name is not in the map "earliestPosition" or the index is smaller that the previous one
                        const isLatest = index > (latestPosition[operation.name] || 0);
        
                        if (isEarliest) {
                            earliestPosition[operation.name] = index;
                            operationsBeforeEarliest[operation.name] = sequence.slice(0, index);
                        }
        
                        if (isLatest) {
                            latestPosition[operation.name] = index;
                            operationsBeforeLatest[operation.name] = sequence.slice(0, index);
                        }
                    }





                    
                });
            });
 
  
            for (const operationName in operationsBeforeEarliest) {
                // Check to see if there is really a list in the map
                if ( operationsBeforeEarliest[operationName] !== undefined){
                    
    
                
               
                    const timeToEarliestOperation = this.calculateTimeToOperation(operationName, operationsBeforeEarliest[operationName], plannedOp, false, station, warehouse);
                    const timeToLatestOperation = this.calculateTimeToOperation(operationName, operationsBeforeLatest[operationName], plannedOp, true,station, warehouse);
            
                    let earliestPercentage = 0;
            
                
                    if (this.operationCounts[earliestPosition[operationName]] && this.operationCounts[earliestPosition[operationName]][operationName]) {
                        earliestPercentage = this.operationCounts[earliestPosition[operationName]][operationName].percentage;
                    }
            
                    const operation = this.product.operations.find(op => op.name === operationName);
                        if (operation) {
                          //  console.log(`Operation: ${operation.name}, Operation ID: ${operation.id}`);
                        
                            // Aquí puedes hacer lo que necesites con el ID y el nombre de la operación
                        }
        
                
                        // Agrega la información al array materialNeededOperationsList
                    this.materialNeededOperationsList.push({
                        name: operationName,
                        earliestTime: timeToEarliestOperation,
                        earliestPercentage: this.operationCounts[earliestPosition[operationName]][operationName]?.percentage || 0,
                        latestTime: timeToLatestOperation,
                        latestPercentage: timeToLatestOperation !== undefined ? 100 : undefined,
                        id: operation!.id
                    })
            
                    
    
               
            } else {
                console.log("No Operations Before the earliest time point, this operation is the next one")
            }
        }
        
            
        
           
        }

    calculateTimeToOperation(operationName: string, precedingOperations: Operation[], plannedOp: Operation, latest:boolean, as:AssemblyStation, wh?: Warehouse){
            // No olvidar que hasta este punto el Job ya esta en la Station, no hay necesidad de considerar el tiempo de transporte
            let timeToOperation: number = this.manager.simulation.time + plannedOp.processingTime
        // Check if the list has not been created AND the the planned Op requires material
            if(this.PredictiveList == false && this.plannedJobOperation!.operation.materialRequired == true && wh){
                console.warn("-- Considering the 30 T.U. --")
                timeToOperation += wh.timeToProcessAGV
            }

    // Explanation: Due to the fact that the list has not been created and the current planned operation (which has just arrived at the queue positon)
    // will wait the complete time to get the material
        
           
        

            if (as.movingJobOperations.length > 0) {

                for (const queuedOperation of as.movingJobOperations ) {
                    
                    if (queuedOperation.job !== this){ // check that the moving JobOperation is not the same as this

                        // if the current Operation arrives before the moving operations
                        if (this.transportTime > queuedOperation.job.transportTime ){
                        
                           //     console.log(queuedOperation.operation.name)
                               
                            } else if (this.transportTime == queuedOperation.job.transportTime){// if it arrives after

                                timeToOperation += queuedOperation.operation.processingTime

                                //console.log("nao sei")
                                }


                            } else {
                                continue
                            
                            }
                        }
              
            } 

            if (as.activeJobOperation !== null) {
                timeToOperation +=as.queuedJobOperations.reduce((sum: number, jobOperation): number => {
                    let operation = jobOperation.operation
                    return sum += operation.setUpTime + operation.processingTime + operation.followUpTime
                }, 0)
             }   
            
            //Time until the current Job gets to the station for the current operation
            // let router = this.manager.router
            // let path = router.getKonvaPath(this.position, as.position)
            // let transTime = router.getTransportationDuration(path)

            // timeToOperation += transTime;

             // Add the time of the Current Operation, and if it is the case, add the waiting time to the material

            // if (this.plannedJobOperation!.operation.materialRequired == true && (!(this.plannedAGVStationWarehouse!.agv.expectedTimeToSupplyMaterial == undefined &&  this.plannedJobOperation!.operation.processingTime == undefined))) {
            //     // This should be the case only for the first operation of every Job AND if this has a material requirement
            //     console.warn("In case the material will arrive later than the job")
            //     if (this.plannedAGVStationWarehouse!.agv.expectedTimeToSupplyMaterial >  transTime){
            //         timeToOperation += this.plannedAGVStationWarehouse!.agv.expectedTimeToSupplyMaterial- transTime // +1 for the assumed transportation time
            //     } else {
            //         timeToOperation += plannedOp.processingTime +1
            //     }
            // } else {
            //     timeToOperation += plannedOp.processingTime + 1
            // }
 
      
            // Adding the time from the operations before the one needing material

            if (precedingOperations !== undefined){
    
            
                for (const operation of precedingOperations) {
                    if (operation.materialRequired !== true){
                        timeToOperation += operation.processingTime + 1 ; //  por el tiempo de transporte

                    } else {
                        timeToOperation += operation.processingTime + 1 + this.manager.warehouses[0].timeToLoadMaterial; // +3 por tiempo de transporte y posible espera a material
                    }
                
                }
              //  if (latest == false){
            //     console.log("Time until earliest point for the Operation taking place:", timeToOperation)
             //   } else{
            // console.log("Time until latest point for the Operation taking place:", timeToOperation)
           //     }
            } else {
             console.log("No operations before:", operationName)
            }
        
            return timeToOperation;
        }


    /**
     * Calculate score for station and due date
     * @param jobOperation
     */
    getScoreForJobOperation = (jobOperation: AssemblyJobOperation, lastOperation: Operation | null) => {
        console.warn("Getting Job Score for: job", this.id)
        let remainingTimeToFinish: number                               //TODO: change to slacktime = remainingTimeToFinish - remaining procesing time
        if (this.dueDate >= this.manager.simulation.time){
            remainingTimeToFinish =  this.dueDate - this.manager.simulation.time
         }else{
            remainingTimeToFinish = 0
         }                                                              //TODO: how to avoid negative numbers
        let setUpTime: number
        if (jobOperation.operation == lastOperation ) {
            setUpTime = 0
        }else{
            setUpTime = jobOperation.operation.setUpTime
        }
        let startTime = 1
        if (this.dispatchedAt != null) {
            startTime = this.dispatchedAt
        }
        
        let remainingTimeMaterial: number 

        if(this.manager.reactiveMaterialSupply == true){
            if(this.manager.maxST === 0){
                console.log("MEX pE", this.manager.strategy.pE)
                return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF)))
            }else{
                console.log("MEX pE", this.manager.strategy.pE)
                return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF) + this.manager.strategy.pF * (jobOperation.operation.setUpTime / this.manager.maxST)))
            }
        } else if (this.manager.controlMaterialSupply == true || this.manager.predictiveMaterialSupply){
            if(this.materialArrived == false){
                console.log("aquiiiii")
                if(jobOperation.job.selectedAGVId.length > 0){
                    let agv_id = jobOperation.job.selectedAGVId
                    let agv = this.manager.getAGVObject(agv_id)
                    remainingTimeMaterial = agv.expectedTimeToSupplyMaterial - this.manager.simulation.time
                }else{
                    console.log("ARMANDO NEW CASE")
                    remainingTimeMaterial = this.manager.maxMS
                }
            } else{
                remainingTimeMaterial = 0
            }
            if(this.manager.maxST === 0){
                // console.log("ARMANDO remainingTimeToFinish",remainingTimeToFinish)
                // console.log("ARMANDO remainingTimeMaterial",remainingTimeMaterial)
                // console.log("ARMANDO RESULT getScoreForJobOperation",(1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF) + this.manager.strategy.pH * (remainingTimeMaterial/  this.manager.maxMS))))
                //console.log("MEX pE", this.manager.strategy.pE)
                return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF) + this.manager.strategy.pH * (remainingTimeMaterial/  this.manager.maxMS)))
                // return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF) + this.manager.strategy.pF * (jobOperation.operation.setUpTime / this.manager.maxST) + this.manager.strategy.pH * (remainingTimeMaterial/  this.manager.maxMS)))
            }else{
                //console.log("MEX pE", this.manager.strategy.pE)
                return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF) + this.manager.strategy.pF * (jobOperation.operation.setUpTime / this.manager.maxST) + this.manager.strategy.pH * (remainingTimeMaterial/  this.manager.maxMS)))
            }

        }else{
            if(this.manager.maxST === 0){
                return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF)))
            }else{
                return (1 / (this.manager.strategy.pE * (remainingTimeToFinish / this.manager.maxRTTF) + this.manager.strategy.pF * (jobOperation.operation.setUpTime / this.manager.maxST)))
            }
        }

    }

    /**
     * Find next operations and move to best station
     */
    async prepareNextOperation() {
        //console.log("Alejandra prepare next operation", this.id)
        let lastJobOperation = this.plannedJobOperation
        let startTime = 0
        let endTime = 0
        
        //MATERIAL CONTROL SUPPLY OR NO MATERIAL SUPPLY STRATEGY AT ALL
        if(this.manager.controlMaterialSupply === true || this.manager.predictiveMaterialSupply === true){ // Check if control material supply is activated
            await this.manager.addToQueueMSControl(this.id, this).then() // ADD to queue
            console.log("PrepareNextOperation ---Job ID:", String(this.id).substr(0,8) +"---", "Product:",this.product.name)
            console.log("prepareNextOperation jobExecutionQueueControl:",this.manager.jobExecutionQueueControl, "time check:", this.manager.simulation.time)


            let oldestOrder = this.manager.jobExecutionQueueControl.keys().next().value;
            if(oldestOrder === this.id && this.manager.materialJobExecutionQueue.size === 0){//check if  its first in the queue list and if there is no material order that need to be dispatch
                this.findNextStation()
            } else{
                return
            }
        } else{
            this.findNextStation() // This the case where there is NO material supply in the assembly
        }

        // this.findNextStation()
        if (this.plannedJobOperation) {
            console.log("")
            console.log("Station Chosen for the planned operation:", this.plannedJobOperation.station.id, "operation:",this.plannedJobOperation.operation.name)

            if(this.manager.controlMaterialSupply === true){ // Check if control material supply is activated
                //await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
                await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
                console.log("QueueMS Control List:", this.manager.jobExecutionQueueControl)


                //Check if for the operation is material required. Otherwise there is no need to dispatch an AGV
                if(this.plannedJobOperation.operation.materialRequired == true){
                    let assemblyJob_order = this.plannedAGVStationWarehouse
                    //console.log("problem martin before crashing", assemblyJob_order)
                    
                    if(assemblyJob_order){
                        let payload: AGVEventPayload = {
                            station: this.plannedAGVStationWarehouse!.station,
                            warehouse: this.plannedAGVStationWarehouse!.warehouse,
                            job: this,
                            agvOperation: {
                                agv: this.plannedAGVStationWarehouse!.agv,
                            },
                            
                        }
                        this.manager.dispatchEvent(AGVEventType.STARTED_MOVING, payload)
                        // assemblyJob_order.agv.setMoving(assemblyJob_order.agv,this,assemblyJob_order.station,assemblyJob_order.warehouse).then()
                    } else{
                        console.log("Dispatch AssemblyJob witout material supply")
                    }
                }

                // await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
            }
            if(this.manager.predictiveMaterialSupply === true){ // Check if control material supply is activated
                //await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
                await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
                console.log("QueueMS Control List:", this.manager.jobExecutionQueueControl)


                //Check if for the operation is material required. Otherwise there is no need to dispatch an AGV
                if(this.plannedJobOperation.operation.materialRequired == true){
                    let assemblyJob_order = this.plannedAGVStationWarehouse
                    //console.log("problem martin before crashing", assemblyJob_order)
                    
                    if(assemblyJob_order){
                        let payload: AGVEventPayload = {
                            station: this.plannedAGVStationWarehouse!.station,
                            warehouse: this.plannedAGVStationWarehouse!.warehouse,
                            job: this,
                            agvOperation: {
                                agv: this.plannedAGVStationWarehouse!.agv,
                            },
                            operation: this.plannedJobOperation.operation
                        }
                        this.manager.dispatchEvent(AGVEventType.STARTED_MOVING, payload)
                        // assemblyJob_order.agv.setMoving(assemblyJob_order.agv,this,assemblyJob_order.station,assemblyJob_order.warehouse).then()
                    } else{
                        console.log("Dispatch AssemblyJob witout material supply")
                    }
                }

                // await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
            }
            console.log("After the if where can be the problem")

            this.plannedJobOperation.station.registerMovingJob({
                operation: this.plannedJobOperation.operation,
                job: this
            })

            // emit start movement event
            let payload: JobEventPayload = {
                jobOperation: {
                    job: this,
                    operation: this.plannedJobOperation!.operation
                },
                station: this.plannedJobOperation!.station
            }
            let targetStation = this.plannedJobOperation!.station
            let stationOrigin = targetStation.origin
            
            //Start reactive material supply Process for this AssemblyJob
            if(this.manager.reactiveMaterialSupply === true && this.plannedJobOperation!.operation.materialRequired === true){
                let wh_local = this.manager.getWarehouseForAssemblyStation(this.plannedJobOperation.station)
                let payload_reactive: AGVEventPayload = {
                    station: this.plannedJobOperation.station,
                    warehouse: wh_local,
                    job: this,
                }
                console.log("Nils prepareneststation start reactive material")
                console.log("Nils AGV station to: ", this.plannedJobOperation.station.id)
                this.manager.dispatchEvent(AGVEventType.REACTIVE_MATERIAL_START, payload_reactive)
            }else if(this.manager.reactiveMaterialSupply === true && this.plannedJobOperation!.operation.materialRequired == false){
                this.materialArrived = true
            }

            if(this.manager.controlMaterialSupply === true || this.manager.predictiveMaterialSupply){ // Check if control material supply is activated
                await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
            }
    
            // special case: check if already in same station
            if (lastJobOperation && lastJobOperation.station.id === this.plannedJobOperation.station.id) {
                // request another operation without leaving the station
                // console.warn('jobs stays in station', targetStation.id.substr(0, 8))
                targetStation.queueJobOperation(payload.jobOperation, QueuePosition.IN_STATION)
                return
            }

            // //MARTIN QUEUE
            // if(this.manager.controlMaterialSupply === true){ // Check if control material supply is activated
            //     await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
            // }

            // check if we are waiting on left or right side of station
            let horizontalQueueOffset = Math.round(chassisWidth * 1.3)
            // calculate waiting position
            let queuePosition = {
                y: stationOrigin.y,
                x: stationOrigin.x + horizontalQueueOffset * (this.position.x > stationOrigin.x ? 1 : -1)
            }
            // check if already in queue position
            let eta = this.manager.simulation.time
            
            if (queuePosition.x !== this.position.x || queuePosition.y !== this.position.y) {
                //if (this.lastEvent === "processing")
                    //this.workingTime += (this.manager.simulation.time - this.lastTime)
                //this.lastTime = this.manager.simulation.time
                this.manager.dispatchEvent(JobEventType.STARTED_MOVING, payload)
                startTime = this.manager.simulation.time
                
            // console.log("The Job started moving at " + startTime + " seconds")
    
                this.status = JobStatus.MOVING

                eta = await this.moveTo(queuePosition)

                if (this.createlist ==false && this.manager.predictiveMaterialSupply=== true){
                    
                    console.log("---Time Check:", this.manager.simulation.time)
                    await this.findNextnextOperations(this.plannedJobOperation!.operation, this.plannedJobOperation!.station, this.plannedAGVStationWarehouse?.warehouse )
                    this.PredictiveList = true
        
                 }

                // notify that job arrived at station
                console.warn("Job ID = " + String(this.id).substr(0,8), "Arrived at Queue Position, Station:", this.plannedJobOperation.station.id)
                this.manager.dispatchEvent(JobEventType.STOPPED_MOVING, payload, eta)
                endTime = this.manager.simulation.time
                this.transportTest += (endTime-startTime)
                // console.log("The Job stopped moving at " + endTime + " seconds")
                // console.log("The transport duration should be " + (endTime - startTime) + " seconds")
                // console.log("The total transport duration should be " +this.transportTest+ " seconds")
            }
            //this.transportTime += (eta - this.lastTime)
            this.lastTime = eta
            //this.lastTime = this.manager.simulation.time
            this.lastEvent = "arrived"
            this.transportTime = this.transportTest
            // console.log("The transport duration was " +this.transportTime+ " seconds");
            //console.log("prepareNextstation() before JobEventType.ARRIVED")
            this.manager.dispatchEvent(JobEventType.ARRIVED, payload, eta)
        } else if (this.uncompletedOperations.length > 0) {
            if(this.manager.controlMaterialSupply === true || this.manager.predictiveMaterialSupply===true){ // Check if control material supply is activated
                await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
            }
            // job infeasible
            this.plannedJobOperation = null
            this.infeasible = true
        } else {
            if(this.manager.controlMaterialSupply === true || this.manager.predictiveMaterialSupply===true){ // Check if control material supply is activated
                await this.manager.removeFromQueueMSControl(this.id, this) // Remove from queue
            }
            this.plannedJobOperation = null
        
            //if (this.lastEvent == "processing")
                //this.workingTime += (this.manager.simulation.time - this.lastTime)
            //this.lastTime = this.manager.simulation.time
            this.manager.dispatchEvent(JobEventType.STARTED_MOVING, {
                jobOperation: {operation: null, job: this},
                station: null
            })


            startTime = this.manager.simulation.time;
            this.lastJobOperationFinishedAt = startTime //NW Output Monitoring
            // console.log("The Job started moving at " + startTime + " seconds")
            const eta = await this.moveTo(sink)
            this.status = JobStatus.COMPLETED
            //this.transportTime += (eta - this.lastTime)
            this.manager.dispatchEvent(JobEventType.COMPLETED, {job: this}, eta)
            endTime = this.manager.simulation.time
            //console.log("The transport duration was " +this.transportTime+ " seconds");
            this.transportTest += (endTime - startTime)
            // console.log("The Job stopped moving at " + endTime + " seconds")
            // console.log("The transport duration should be " + (endTime - startTime) + " seconds")
            // console.log("The total transport duration should be " +this.transportTest+ " seconds")
            this.transportTime = this.transportTest
            // console.log("The transport duration was " +this.transportTime+ " seconds");
            this.manager.completedJobs.push(this)
            this.completedAt = eta
            this.JobEndTime = this.completedAt
            this.JobTotalTime = this.JobEndTime - this.JobStartTime
            this.JobElseTime = this.JobTotalTime -(this.transportTime + this.workingTime + this.waitingTime)
            this.waitingTime += this.JobElseTime
            let index = this.manager.activeJobs.findIndex(jo => jo.id === this.id)
            this.manager.activeJobs.splice(index, 1)
            /**f this.sequencesString = "";
            for(let seq of this.sequencesArray){
                this.sequencesString += " " + seq;
            } */


            console.warn("Bye Bye", "ID:", this.id)
            //Dado que ya este Job acabo, ahora hay que borrarlo de la lista de material needed en manager

            if (this.manager.predictiveMaterialSupply === true){
                this.manager.removeMaterialNeedsByJobId(this)
                for (let wh of this.manager.warehouses){
    
                    wh.counter -=1
                    console.log(JSON.stringify(wh.counter))
                }
    
            }
          




            for(let station of this.manager.assemblyStations) {
                let index1 = station.queuedJobOperations.findIndex(qop => qop.job.id === this.id)
                if(index1 != -1) {
                    station.queuedJobOperations.splice(index1, 1)
                }
            }
        }

    }
    
    /**
     * Move to station
     * and register on its queue
     * resolve time of arrival
     */
    moveTo = (coordinate: Coordinate): Promise<number> => {
        // calculate route
        let router = this.manager.router
        let path = router.getKonvaPath(this.position, coordinate)

        const initial = {...this.position}

        let pathLength = path.getLength() // in px
        //console.log("The distance is" + pathLength + " Pixel")
        let estimatedTravelDuration = router.getTransportationDuration(path)
        let ref = this
        let startTime = this.manager.simulation.time
        let eta = startTime + estimatedTravelDuration

        // make method sync in dry mode and skip visualization of movement
        if (this.manager.simulation.dryRun) {
            // update position
            this.position = {
                ...coordinate,
                angle: 90,
            }
            // return eta for event scheduling
            return Promise.resolve(eta)
        }

        // handle async animation of movement
        return new Promise((resolve, reject) => {
            if (ref.anim) {
                ref.anim.stop()
            }
            ref.anim = new Konva.Animation(function (frame?: IFrame): boolean | void {
                if (!frame || !ref.manager.simulation.isRunning) return

                // interpolate eta and current simulation time
                let progress = (ref.manager.simulation.time - startTime) / estimatedTravelDuration

                if (progress >= 1) {
                    if (!ref.anim) return
                    // set exact final position
                    ref.position = {
                        ...coordinate,
                        angle: 90,
                        flippedX: (coordinate.x < initial.x || ref.position.flippedX),
                        flippedY: false,
                    }
                    ref.anim.stop()
                    ref.anim = null
                    resolve(ref.manager.simulation.time)
                    return
                }
                let traveledLength = progress * pathLength
                let pt = progress >= 1 ? coordinate : path.getPointAtLength(traveledLength);
                if (!pt) {
                    return
                }
                let angle: number

                // keep angle with same position
                if (pt.x === ref.position.x && pt.y === ref.position.y) {
                    angle = ref.position.angle
                } else {
                    angle = getAngleBetweenPoints(ref.position, pt)
                }

                ref.position = {
                    x: pt.x,
                    y: pt.y,
                    angle: angle,
                    flippedX: pt.x < ref.position.x, // flip when moving to left
                    flippedY: false,
                }

            }, this.konvaStage);

            if (this.manager.simulation.isRunning) {
                ref.anim.start()
            }
        })
        // TODO track path history
    }
}
