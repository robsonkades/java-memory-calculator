'use client'
import { useState } from "react";
import { Pie } from 'react-chartjs-2';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Home() {
    const [copySuccess, setCopySuccess] = useState(false);
    const [heapSize, setHeapSize] = useState(384);
    const [threads, setThreads] = useState(85);
    const [classes, setClasses] = useState(30000);
    const [stackSizePerThread, setStackSizePerThread] = useState(1);
    const [codeCache, setCodeCache] = useState(64);
    const [maxDirectMemorySize, setMaxDirectMemorySize] = useState(10);
    const [gcType, setGCType] = useState('G1');

    // Heap Memory calculations updated for Java 21
    const youngGen = Math.ceil(heapSize * (gcType === 'G1' ? 0.40 : 0.25));
    const oldGen = heapSize - youngGen;

    // Non-Heap Memory calculations refined
    const metaspace = Math.ceil(classes * 0.005);
    const threadStacks = threads * stackSizePerThread;
    const compressedClassSpace = Math.ceil(classes * 0.0015);
    const totalNonHeap = metaspace + codeCache + threadStacks + compressedClassSpace;

    // Other Memory calculations updated
    const nativeMemory = Math.ceil((heapSize + totalNonHeap) * 0.03);
    const jvmOverhead = Math.ceil(heapSize * 0.03);
    const totalOther = maxDirectMemorySize + nativeMemory + jvmOverhead;

    // Total with safety margin
    const subtotal = heapSize + totalNonHeap + totalOther;
    const total = subtotal % 8 === 0 ? subtotal : Math.ceil(subtotal / 8) * 8;
    const safetyMarginPercent = (((total - subtotal) / subtotal) * 100).toFixed(2);
    const safetyMargin = total - subtotal

    // Pie Chart Data
    const pieData = {
        labels: ['Heap', 'Non-Heap', 'Other', 'Safety Margin'],
        datasets: [
            {
                data: [heapSize, totalNonHeap, totalOther, safetyMargin],
                backgroundColor: ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCE56'],
                hoverBackgroundColor: ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCE56'],
            },
        ],
    };

    // eslint-disable-next-line react/prop-types
    const TooltipLabel = ({ text, tooltip }: Readonly<{
        text: React.ReactNode;
        tooltip: string
    }>) => (
        <div className="group relative inline-block">
            <div className="inline-flex items-center">
                {text}
            </div>
            <div
                className="invisible group-hover:visible absolute z-10 w-64 bg-black text-white text-sm rounded-lg py-2 px-3 top-full mt-1 shadow-lg"
                style={{ transform: "translateX(-50%)", left: "50%" }}
            >
                {tooltip}
                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-black rotate-45" />
            </div>
        </div>
    );

    const JvmParameters = () => {
        const g1Settings = gcType === 'G1' ? (
            <>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:+UseG1GC</span>}
                        tooltip="The G1 is the default garbage collector in Java 21. It is a low-latency collector that divides the heap into regions, ideal for heaps larger than 4GB and applications requiring predictable pause times."
                    />
                </li>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:MaxGCPauseMillis=200</span>}
                        tooltip="Sets the maximum pause time goal for G1 collections in milliseconds. G1 will attempt to adjust its behavior to keep pauses below this value. A lower value results in shorter pauses but may reduce throughput."
                    />
                </li>
            </>
        ) : (
            <>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:+UseZGC</span>}
                        tooltip="ZGC is a scalable, low-latency garbage collector that keeps pauses below 1ms regardless of heap size. It is ideal for applications that need consistent response times and can utilize more CPU and memory."
                    />
                </li>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:ZAllocationSpikeTolerance=2</span>}
                        tooltip="Controls how much extra space ZGC reserves for allocation spikes. A higher value increases tolerance for spikes but uses more memory. A value of 2 is a good balance for most applications."
                    />
                </li>
            </>
        );

        return (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border">
                <h2 className="text-xl font-bold">Recommended JVM Parameters for Java 21</h2>
                <ul className="list-disc list-inside mt-4">
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-Xms{Math.floor(heapSize * 0.7)}m -Xmx{heapSize}m</span>}
                            tooltip="Sets the minimum and maximum heap sizes. Making them equal reduces memory reallocations. It is recommended to set Xms to 70% of Xmx to allow dynamic adjustments without wasting initial memory."
                        />
                    </li>
                    {g1Settings}
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-Xss{stackSizePerThread}M</span>}
                            tooltip="Sets the stack size for each thread. The default value is usually sufficient. Increase it if you encounter StackOverflowError exceptions or deep recursion."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:ReservedCodeCacheSize={codeCache}m</span>}
                            tooltip="Space reserved for JIT-compiled code. Important for applications that use a lot of dynamic code or have many classes. Increase it if you see messages about a full code cache. You can check the current value with the parameter -XX:+PrintFlagsFinal."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:MaxDirectMemorySize={maxDirectMemorySize}m</span>}
                            tooltip="Maximum limit for direct memory (NIO). Important for applications that use a lot of NIO or Netty. A value that is too high can cause native OOM issues."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:+ExitOnOutOfMemoryError</span>}
                            tooltip="Exit the JVM when an OutOfMemoryError is encountered. This can help avoid a situation where the JVM keeps running and consuming more memory without being able to recover."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:+UnlockDiagnosticVMOptions</span>}
                            tooltip="Unlocks additional diagnostic options for JVM, enabling more advanced configuration and debugging options."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:NativeMemoryTracking=summary</span>}
                            tooltip="Enables Native Memory Tracking (NMT) and provides a summary of native memory usage. Useful for diagnosing memory issues related to native memory allocations."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:+PrintNMTStatistics</span>}
                            tooltip="Prints statistics about native memory usage. Helps in debugging and understanding the memory consumption of native code."
                        />
                    </li>

                </ul>
                <button onClick={copyToClipboard} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Copy JVM Parameters
                </button>

                {copySuccess && (
                    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-300 ease-in-out">
                        JVM parameters copied to clipboard!
                    </div>
                )}
            </div>
        );
    };


    const copyToClipboard = () => {
        let gcConfig = "";
        if (gcType === 'G1') {
            gcConfig = "-XX:+UseG1GC -XX:MaxGCPauseMillis=200 ";
        } else {
            gcConfig = "-XX:+UseZGC -XX:ZAllocationSpikeTolerance=2 ";
        }

        const jvmParameters = gcConfig + `-Xms${Math.floor(heapSize * 0.7)}m -Xmx${heapSize}m -Xss${stackSizePerThread}M -XX:ReservedCodeCacheSize=${codeCache}m -XX:MaxDirectMemorySize=${maxDirectMemorySize}m -XX:+ExitOnOutOfMemoryError -XX:+UnlockDiagnosticVMOptions -XX:NativeMemoryTracking=summary -XX:+PrintNMTStatistics`;

        navigator.clipboard.writeText(jvmParameters.trim())
            .then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 3000); // Esconde o feedback após 3 segundos
            })
            .catch(err => {
                console.error('Failed to copy JVM parameters: ', err);
            });
    };


    return (
        <div className="p-4 max-w-6xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
                <h1 className="text-2xl font-bold mb-6">Java 21 Memory Calculator</h1>

                <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-4">
                    <p className="text-blue-700">
                        Optimized for Java 21 with support for G1 and ZGC garbage collectors.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block font-medium mb-1">Garbage Collector:</label>
                            <select
                                value={gcType}
                                onChange={(e) => setGCType(e.target.value)}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            >
                                <option value="G1">G1 GC (Recommended)</option>
                                <option value="ZGC">Z GC (Low latency)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Desired Heap (MB):</label>
                            <input
                                type="number"
                                value={heapSize}
                                onChange={(e) => setHeapSize(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Number of Threads:</label>
                            <input
                                type="number"
                                value={threads}
                                onChange={(e) => setThreads(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Number of Classes:</label>
                            <input
                                type="number"
                                value={classes}
                                onChange={(e) => setClasses(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Reserved Code Cache (MB):</label>
                            <input
                                type="number"
                                value={codeCache}
                                onChange={(e) => setCodeCache(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Direct Memory Size (MB):</label>
                            <input
                                type="number"
                                value={maxDirectMemorySize}
                                onChange={(e) => setMaxDirectMemorySize(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Stack size per Thread (MB):</label>
                            <input
                                type="number"
                                value={stackSizePerThread}
                                onChange={(e) => setStackSizePerThread(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-4">Memory Distribution</h2>
                        <Pie data={pieData} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-blue-50 rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-2">Heap Memory: {heapSize}MB</h2>
                        <div>Young Generation: {youngGen}MB</div>
                        <div>Old Generation: {oldGen}MB</div>
                    </div>

                    <div className="bg-red-50 rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-2">Non-Heap Memory: {totalNonHeap}MB</h2>
                        <div>Metaspace: {metaspace}MB</div>
                        <div>Code Cache: {codeCache}MB</div>
                        <div>Thread Stacks: {threadStacks}MB</div>
                        <div>Compressed Class: {compressedClassSpace}MB</div>
                    </div>

                    <div className="bg-green-50 rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-2">Other Memory: {totalOther}MB</h2>
                        <div>Direct Buffers: {maxDirectMemorySize}MB</div>
                        <div>Native Memory: {nativeMemory}MB</div>
                        <div>JVM Overhead: {jvmOverhead}MB</div>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                    <div className="text-xl font-bold">Recommended Total Memory: {total}MB</div>
                    <div className="text-sm text-gray-600">Includes a safety margin of {safetyMargin}MB ({safetyMarginPercent}%)</div>
                </div>

                <JvmParameters />
            </div>
        </div>
    );
}
