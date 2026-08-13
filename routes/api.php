<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\HabitController;
use App\Http\Controllers\RoutineLogController;
use App\Http\Controllers\FocusSessionController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\ExportController;

Route::apiResource('profile', ProfileController::class);
Route::apiResource('habits', HabitController::class);
Route::apiResource('routine-logs', RoutineLogController::class);
Route::apiResource('focus-sessions', FocusSessionController::class);
Route::apiResource('tasks', TaskController::class);

// Toggle habit done for today
Route::post('habits/{habit}/toggle', [HabitController::class, 'toggle'])
    ->name('habits.toggle');

// Export CSV
Route::get('export/csv', [ExportController::class, 'csv'])
    ->name('export.csv');
