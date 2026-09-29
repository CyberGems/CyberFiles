namespace CyberFiles.WinUIPrototype;

public enum TransferKind
{
    Copy,
    Move,
}

public sealed record FileTransferRequest(string SourcePath, string DestinationDirectory, TransferKind Kind);

public enum TransferFailureReason
{
    Unknown,
    Collision,
    SourceMissing,
    DestinationMissing,
    SelfTarget,
    ReparsePoint,
    CrossVolumeFolderMove,
    SourceChanged,
}

public sealed record FileTransferItemResult(
    FileTransferRequest Request,
    bool Succeeded,
    bool Cancelled,
    string? Error,
    TransferFailureReason FailureReason = TransferFailureReason.Unknown);

internal sealed class TransferFailureException(TransferFailureReason reason, string message) : IOException(message)
{
    public TransferFailureReason Reason { get; } = reason;
}

public sealed record FileOperationQueueSnapshot(
    bool IsRunning,
    int PendingCount,
    int CompletedCount,
    int TotalCount,
    FileTransferRequest? Current,
    double CurrentProgress,
    bool LastSucceeded,
    bool LastCancelled,
    string? LastError);

public sealed class FileOperationQueue
{
    private readonly object _gate = new();
    private readonly Queue<FileTransferRequest> _pending = new();
    private CancellationTokenSource? _currentCancellation;
    private FileTransferRequest? _current;
    private bool _isRunning;
    private int _completedCount;
    private int _totalCount;
    private double _currentProgress;
    private long _lastProgressNotification;
    private bool _lastSucceeded;
    private bool _lastCancelled;
    private string? _lastError;

    public event Action<FileOperationQueueSnapshot>? StateChanged;
    public event Action<FileTransferItemResult>? ItemFinished;

    public void Enqueue(IEnumerable<string> sourcePaths, string destinationDirectory, TransferKind kind)
    {
        var requests = sourcePaths
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(path => new FileTransferRequest(path, destinationDirectory, kind))
            .ToArray();
        if (requests.Length == 0)
            return;

        var startWorker = false;
        lock (_gate)
        {
            foreach (var request in requests)
                _pending.Enqueue(request);
            _totalCount += requests.Length;
            _lastError = null;
            if (!_isRunning)
            {
                _isRunning = true;
                startWorker = true;
            }
        }

        PublishState();
        if (startWorker)
            _ = Task.Run(ProcessQueueAsync);
    }

    public void CancelCurrent()
    {
        lock (_gate)
            _currentCancellation?.Cancel();
    }

    public void CancelAll()
    {
        lock (_gate)
        {
            _pending.Clear();
            _totalCount = _completedCount + (_current is null ? 0 : 1);
            _currentCancellation?.Cancel();
        }
        PublishState();
    }

    private async Task ProcessQueueAsync()
    {
        while (true)
        {
            FileTransferRequest? request;
            CancellationTokenSource? cancellation;
            lock (_gate)
            {
                if (_pending.Count == 0)
                {
                    _current = null;
                    _currentCancellation = null;
                    _currentProgress = 0;
                    _isRunning = false;
                    request = null;
                    cancellation = null;
                }
                else
                {
                    request = _pending.Dequeue();
                    cancellation = new CancellationTokenSource();
                    _current = request;
                    _currentCancellation = cancellation;
                    _currentProgress = 0;
                }
            }

            if (request is null)
            {
                PublishState();
                return;
            }

            PublishState();
            FileTransferItemResult result;
            try
            {
                await FileTransferEngine.ExecuteAsync(
                    request,
                    progress => PublishProgress(request, progress),
                    cancellation!.Token);
                result = new FileTransferItemResult(request, Succeeded: true, Cancelled: false, Error: null);
            }
            catch (OperationCanceledException)
            {
                result = new FileTransferItemResult(request, Succeeded: false, Cancelled: true, Error: null);
            }
            catch (TransferFailureException ex)
            {
                result = new FileTransferItemResult(request, Succeeded: false, Cancelled: false, Error: ex.Message, FailureReason: ex.Reason);
            }
            catch (Exception ex)
            {
                result = new FileTransferItemResult(request, Succeeded: false, Cancelled: false, Error: ex.Message);
            }
            finally
            {
                cancellation!.Dispose();
            }

            lock (_gate)
            {
                _completedCount++;
                _current = null;
                _currentCancellation = null;
                _currentProgress = 0;
                _lastSucceeded = result.Succeeded;
                _lastCancelled = result.Cancelled;
                _lastError = result.Error;
            }

            ItemFinished?.Invoke(result);
            PublishState();
        }
    }

    private void PublishProgress(FileTransferRequest request, double progress)
    {
        var now = Environment.TickCount64;
        lock (_gate)
        {
            if (!ReferenceEquals(_current, request) || progress >= 0 && now - _lastProgressNotification < 120 && progress < 1)
                return;

            _lastProgressNotification = now;
            _currentProgress = progress < 0 ? -1 : Math.Clamp(progress, 0, 1);
        }
        PublishState();
    }

    private void PublishState()
    {
        FileOperationQueueSnapshot snapshot;
        lock (_gate)
        {
            snapshot = new FileOperationQueueSnapshot(
                _isRunning,
                _pending.Count,
                _completedCount,
                _totalCount,
                _current,
                _currentProgress,
                _lastSucceeded,
                _lastCancelled,
                _lastError);
        }
        StateChanged?.Invoke(snapshot);
    }
}

internal static class FileTransferEngine
{
    private const int BufferSize = 1024 * 1024;

    public static async Task ExecuteAsync(
        FileTransferRequest request,
        Action<double> reportProgress,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var source = NormalizePath(request.SourcePath);
        var destinationDirectory = NormalizePath(request.DestinationDirectory);
        if (!Directory.Exists(destinationDirectory))
            throw new TransferFailureException(TransferFailureReason.DestinationMissing, $"Destination folder does not exist: {destinationDirectory}");
        if (!File.Exists(source) && !Directory.Exists(source))
            throw new TransferFailureException(TransferFailureReason.SourceMissing, $"The selected source no longer exists: {source}");

        var sourceAttributes = File.GetAttributes(source);
        RejectReparsePoint(source, sourceAttributes);
        var isDirectory = (sourceAttributes & FileAttributes.Directory) != 0;
        var sourceName = Path.GetFileName(Path.TrimEndingDirectorySeparator(source));
        var target = Path.Combine(destinationDirectory, sourceName);
        EnsureTargetDoesNotExist(target);

        if (isDirectory && IsSameOrDescendant(source, destinationDirectory))
            throw new TransferFailureException(TransferFailureReason.SelfTarget, "A folder cannot be copied or moved into itself or one of its child folders.");

        var sameVolume = string.Equals(Path.GetPathRoot(source), Path.GetPathRoot(destinationDirectory), StringComparison.OrdinalIgnoreCase);
        if (request.Kind == TransferKind.Move && sameVolume)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (isDirectory)
                Directory.Move(source, target);
            else
                File.Move(source, target);
            reportProgress(1);
            return;
        }

        if (request.Kind == TransferKind.Move && isDirectory)
            throw new TransferFailureException(TransferFailureReason.CrossVolumeFolderMove, "Moving folders between different volumes is not supported yet.");

        if (isDirectory)
        {
            reportProgress(-1);
            var totalBytes = await Task.Run(() => MeasureDirectory(source, cancellationToken), cancellationToken);
            reportProgress(0);
            await CopyDirectoryAsync(source, target, totalBytes, reportProgress, cancellationToken);
        }
        else
        {
            var length = new FileInfo(source).Length;
            await CopyFileAsync(source, target, 0, length, length, reportProgress, cancellationToken);
        }

        if (request.Kind == TransferKind.Move)
        {
            cancellationToken.ThrowIfCancellationRequested();
            File.Delete(source);
        }
    }

    private static async Task CopyDirectoryAsync(
        string source,
        string target,
        long totalBytes,
        Action<double> reportProgress,
        CancellationToken cancellationToken)
    {
        EnsureTargetDoesNotExist(target);
        Directory.CreateDirectory(target);
        long completedBytes = 0;
        var buffer = new byte[BufferSize];
        var pendingDirectories = new Stack<DirectoryTraversal>();
        pendingDirectories.Push(OpenDirectory(source, target));
        try
        {
            while (pendingDirectories.Count > 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var current = pendingDirectories.Peek();
                if (!current.Entries.MoveNext())
                {
                    current.Dispose();
                    pendingDirectories.Pop();
                    continue;
                }

                var sourceEntry = current.Entries.Current;
                var attributes = File.GetAttributes(sourceEntry);
                RejectReparsePoint(sourceEntry, attributes);
                var targetEntry = Path.Combine(current.TargetPath, Path.GetFileName(sourceEntry));
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    Directory.CreateDirectory(targetEntry);
                    pendingDirectories.Push(OpenDirectory(sourceEntry, targetEntry));
                    continue;
                }

                var length = new FileInfo(sourceEntry).Length;
                await CopyFileAsync(sourceEntry, targetEntry, completedBytes, length, totalBytes, reportProgress, cancellationToken, buffer);
                completedBytes += length;
            }
        }
        finally
        {
            while (pendingDirectories.Count > 0)
                pendingDirectories.Pop().Dispose();
        }

        reportProgress(1);
    }

    private static async Task CopyFileAsync(
        string source,
        string target,
        long bytesBeforeFile,
        long fileLength,
        long totalBytes,
        Action<double> reportProgress,
        CancellationToken cancellationToken,
        byte[]? reusableBuffer = null)
    {
        EnsureTargetDoesNotExist(target);
        await using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, BufferSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
        var buffer = reusableBuffer ?? new byte[BufferSize];
        long copied = 0;
        while (true)
        {
            var read = await input.ReadAsync(buffer.AsMemory(), cancellationToken);
            if (read == 0)
                break;

            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            copied += read;
            reportProgress(totalBytes == 0 ? 1 : (double)(bytesBeforeFile + copied) / totalBytes);
        }

        if (copied != fileLength)
            throw new TransferFailureException(TransferFailureReason.SourceChanged, $"File size changed while it was being copied: {source}");
    }

    private static long MeasureDirectory(string source, CancellationToken cancellationToken)
    {
        var pendingDirectories = new Stack<DirectoryTraversal>();
        pendingDirectories.Push(OpenDirectory(source, string.Empty));
        long totalBytes = 0;
        try
        {
            while (pendingDirectories.Count > 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var current = pendingDirectories.Peek();
                if (!current.Entries.MoveNext())
                {
                    current.Dispose();
                    pendingDirectories.Pop();
                    continue;
                }

                var entry = current.Entries.Current;
                var attributes = File.GetAttributes(entry);
                RejectReparsePoint(entry, attributes);
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    pendingDirectories.Push(OpenDirectory(entry, string.Empty));
                }
                else
                {
                    var length = new FileInfo(entry).Length;
                    totalBytes = checked(totalBytes + length);
                }
            }
        }
        finally
        {
            while (pendingDirectories.Count > 0)
                pendingDirectories.Pop().Dispose();
        }

        return totalBytes;
    }

    private static DirectoryTraversal OpenDirectory(string sourcePath, string targetPath)
    {
        RejectReparsePoint(sourcePath, File.GetAttributes(sourcePath));
        return new DirectoryTraversal(targetPath, Directory.EnumerateFileSystemEntries(sourcePath).GetEnumerator());
    }

    private static string NormalizePath(string path) => Path.GetFullPath(path.Trim().Trim('"'));

    private static void EnsureTargetDoesNotExist(string path)
    {
        if (File.Exists(path) || Directory.Exists(path))
            throw new TransferFailureException(TransferFailureReason.Collision, $"The destination already contains an item with this name: {path}");
    }

    private static void RejectReparsePoint(string path, FileAttributes attributes)
    {
        if ((attributes & FileAttributes.ReparsePoint) != 0)
            throw new TransferFailureException(TransferFailureReason.ReparsePoint, $"Symbolic links and other reparse points are skipped for safety: {path}");
    }

    private static bool IsSameOrDescendant(string parent, string candidate)
    {
        var relative = Path.GetRelativePath(parent, candidate);
        return relative == "." || (!Path.IsPathRooted(relative) &&
            relative != ".." &&
            !relative.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal) &&
            !relative.StartsWith(".." + Path.AltDirectorySeparatorChar, StringComparison.Ordinal));
    }

    private sealed class DirectoryTraversal(string targetPath, IEnumerator<string> entries) : IDisposable
    {
        public string TargetPath { get; } = targetPath;
        public IEnumerator<string> Entries { get; } = entries;

        public void Dispose() => Entries.Dispose();
    }
}
