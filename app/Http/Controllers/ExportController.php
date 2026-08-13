<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Task;
use App\Models\RoutineLog;
use App\Models\FocusSession;

class ExportController extends Controller
{
    public function csv()
    {
        $rows = [['Date', 'Category', 'Item', 'Status']];

        // Tasks
        foreach (Task::all() as $t) {
            $rows[] = [
                $t->task_date,
                'task',
                $t->text,
                $t->done ? 'done' : 'pending'
            ];
        }

        // Routine Logs
        foreach (RoutineLog::all() as $r) {
            foreach (['move', 'reflect', 'grow'] as $k) {
                if ($r->$k) {
                    $rows[] = [
                        $r->log_date,
                        'routine',
                        $k,
                        'done'
                    ];
                }
            }
        }

        // Focus Sessions
        foreach (FocusSession::all() as $f) {
            $rows[] = [
                $f->session_date,
                'focus',
                $f->goal ?? '',
                $f->minutes . 'min'
            ];
        }

        // Convert to CSV
        $csv = implode("\n", array_map(function ($row) {
            return implode(',', array_map(function ($value) {
                return '"' . $value . '"';
            }, $row));
        }, $rows));

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="kawa-export-' . now()->toDateString() . '.csv"',
        ]);
    }
}
