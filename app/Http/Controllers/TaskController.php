<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class TaskController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index() {
    $today = now()->toDateString();
    return response()->json(Task::where('task_date', $today)->get());
    }

    public function store(Request $request) {
        $task = Task::create([
            'task_date' => now()->toDateString(),
            'text' => $request->text,
            'done' => false,
        ]);
        return response()->json($task, 201);
    }

    public function update(Request $request, Task $task) {
        $task->update($request->only(['text', 'done']));
        return response()->json($task);
    }

    public function destroy(Task $task) {
        $task->delete();
        return response()->json(['deleted' => true]);
    }
}
