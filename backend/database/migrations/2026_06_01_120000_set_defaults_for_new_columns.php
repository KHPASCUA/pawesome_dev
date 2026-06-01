<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Set default values for new nullable columns
        DB::statement('UPDATE inventory_items SET cost = 0 WHERE cost IS NULL');
        DB::statement("UPDATE attendance SET source = 'manual' WHERE source IS NULL");
        DB::statement("UPDATE boarding_rooms SET hotel_category = 'standard' WHERE hotel_category IS NULL");
        
        // Set vaccination_card_verified_at for existing approved/completed boardings for backward compatibility
        DB::statement("UPDATE boardings SET vaccination_card_verified_at = created_at WHERE vaccination_card_verified_at IS NULL AND status IN ('approved', 'confirmed', 'checked_in', 'completed')");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No rollback needed for data updates
    }
};
