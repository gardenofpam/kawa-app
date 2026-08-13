<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('routine_logs', function (Blueprint $table) {
            $table->id();
            $table->date('log_date');
            $table->boolean('move')->default(false);
            $table->boolean('reflect')->default(false);
            $table->boolean('grow')->default(false);
            $table->integer('streak')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('routine_logs');
    }
};
