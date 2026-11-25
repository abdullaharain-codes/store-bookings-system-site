<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_bookings', function (Blueprint $table) {
            $table->string('recipient_name')->nullable()->after('address_id');
            $table->string('phone', 20)->nullable()->after('recipient_name');
            $table->string('address_line_1')->nullable()->after('phone');
            $table->string('address_line_2')->nullable()->after('address_line_1');
            $table->string('city', 100)->nullable()->after('address_line_2');
            $table->string('postal_code', 20)->nullable()->after('city');
            $table->string('map_link', 500)->nullable()->after('postal_code');
            $table->string('customer_gender')->nullable()->after('map_link');
            $table->string('issue_type')->nullable()->after('problem_description');
            $table->string('device_type')->nullable()->after('issue_type');
            $table->string('brand', 100)->nullable()->after('device_type');
            $table->string('model', 100)->nullable()->after('brand');
        });

        Schema::table('service_bookings', function (Blueprint $table) {
            $table->dropForeign(['address_id']);
            $table->foreign('address_id')->references('id')->on('addresses')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('service_bookings', function (Blueprint $table) {
            $table->dropForeign(['address_id']);
            $table->foreign('address_id')->references('id')->on('addresses')->restrictOnDelete();
        });

        Schema::table('service_bookings', function (Blueprint $table) {
            $table->dropColumn([
                'recipient_name',
                'phone',
                'address_line_1',
                'address_line_2',
                'city',
                'postal_code',
                'map_link',
                'customer_gender',
                'issue_type',
                'device_type',
                'brand',
                'model',
            ]);
        });
    }
};
