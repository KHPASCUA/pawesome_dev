<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PostPullVaccinationSmokeTest extends TestCase
{
    use RefreshDatabase;

    protected $customer;
    protected $receptionist;

    protected function setUp(): void
    {
        parent::setUp();

        // Create test users
        $this->customer = User::factory()->create([
            'email' => 'customer@example.com',
            'password' => bcrypt('password'),
            'role' => 'customer',
        ]);

        $this->receptionist = User::factory()->create([
            'email' => 'receptionist@example.com',
            'password' => bcrypt('password'),
            'role' => 'receptionist',
        ]);
    }

    /** @test */
    public function it_verifies_vaccination_verification_route_exists()
    {
        // Test that the route exists (should not return 404 for route not found)
        $response = $this->actingAs($this->receptionist)
            ->postJson("/api/receptionist/boarding-requests/999/verify-vaccination");

        // Should return 404 (model not found) or 422 (validation), not 404 (route not found)
        // If it returns 404 with "No query results for model", the route exists
        $this->assertNotEquals(404, $response->status());
    }

    /** @test */
    public function vaccination_verification_route_requires_authentication()
    {
        $response = $this->postJson("/api/receptionist/boarding-requests/999/verify-vaccination");

        // Should return 401 (unauthorized)
        $response->assertStatus(401);
    }

    /** @test */
    public function vaccination_verification_route_requires_receptionist_role()
    {
        $response = $this->actingAs($this->customer)
            ->postJson("/api/receptionist/boarding-requests/999/verify-vaccination");

        // Should return 403 (forbidden) - customer cannot verify
        $response->assertStatus(403);
    }

    /** @test */
    public function receptionist_can_access_vaccination_verification_endpoint()
    {
        $response = $this->actingAs($this->receptionist)
            ->postJson("/api/receptionist/boarding-requests/999/verify-vaccination");

        // Should not return 403 (forbidden) - receptionist has access
        // Will likely return 404 (model not found) or 422 (validation), but not 403
        $this->assertNotEquals(403, $response->status());
    }

    /** @test */
    public function boarding_routes_are_accessible_to_receptionist()
    {
        $response = $this->actingAs($this->receptionist)
            ->getJson("/api/receptionist/boarding-requests");

        // Should return 200 (success)
        $response->assertStatus(200);
    }

    /** @test */
    public function customer_can_access_customer_boarding_routes()
    {
        $response = $this->actingAs($this->customer)
            ->getJson("/api/customer/boardings");

        // Should return 200 (success)
        $response->assertStatus(200);
    }

    /** @test */
    public function customer_cannot_access_receptionist_routes()
    {
        $response = $this->actingAs($this->customer)
            ->getJson("/api/receptionist/boarding-requests");

        // Should return 403 (forbidden)
        $response->assertStatus(403);
    }
}
