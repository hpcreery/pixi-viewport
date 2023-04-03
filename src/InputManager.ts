import { Point, Rectangle } from '@pixi/core';

import type { IPointData } from '@pixi/core';
import { FederatedPointerEvent } from '@pixi/events';
import type { Viewport } from './Viewport';

export interface IViewportTouch
{
    id: number;
    last: IPointData | null;
}

/**
 * Handles all input for Viewport
 *
 * @internal
 * @ignore
 * @private
 */
export class InputManager
{
    public readonly viewport: Viewport;

    public clickedAvailable?: boolean;
    public isMouseDown?: boolean;
    public last?: Point | null;
    public wheelFunction?: (e: WheelEvent) => void;
    public upFunction?: (e: PointerEvent) => void;
    public downFunction?: (e: PointerEvent) => void;
    public moveFunction?: (e: PointerEvent) => void;
    /** List of active touches on viewport */
    public touches: IViewportTouch[];

    constructor(viewport: Viewport)
    {
        this.viewport = viewport;
        this.touches = [];

        this.addListeners();
    }

    /** Add input listeners */
    private addListeners()
    {
        this.viewport.eventMode = 'static';
        if (!this.viewport.forceHitArea)
        {
            this.viewport.hitArea = new Rectangle(0, 0, this.viewport.worldWidth, this.viewport.worldHeight);
        }
        // this.viewport.on('pointerdown', this.down, this);
        this.downFunction = (e) => this.down(e);
        this.viewport.options.canvasElement.addEventListener('pointerdown', this.downFunction, { passive: true });

        if (this.viewport.options.allowPreserveDragOutside)

        {
            // this.viewport.on('globalpointermove', this.move, this);
            // this.viewport.options.canvasElement.addEventListener('globalpointermove',
            //     this.moveFunction,
            //     { passive: true });
        }
        else
        {
            // this.viewport.on('pointermove', this.move, this);
            this.moveFunction = (e) => this.move(e);
            this.viewport.options.canvasElement.addEventListener('pointermove', this.moveFunction, { passive: true });
        }

        // this.viewport.on('pointerup', this.up, this);
        this.upFunction = (e) => this.up(e);
        this.viewport.options.canvasElement.addEventListener('pointerup', this.upFunction, { passive: true });

        // this.viewport.on('pointerupoutside', this.up, this);
        // this.viewport.options.canvasElement.addEventListener('pointerupoutside', this.upFunction, { passive: true });

        // this.viewport.on('pointercancel', this.up, this);
        this.viewport.options.canvasElement.addEventListener('pointercancel', this.upFunction, { passive: true });

        if (!this.viewport.options.allowPreserveDragOutside)
        {
            // this.viewport.on('pointerleave', this.up, this);
            this.viewport.options.canvasElement.addEventListener('pointerleave', this.upFunction, { passive: true });
        }

        this.wheelFunction = (e) => this.handleWheel(e);
        this.viewport.options.canvasElement.addEventListener(
            'wheel',
            this.wheelFunction as any,
            { passive: this.viewport.options.passiveWheel });
        this.isMouseDown = false;
    }

    /**
     * Removes all event listeners from viewport
     * (useful for cleanup of wheel when removing viewport)
     */
    public destroy(): void
    {
        this.viewport.options.canvasElement.removeEventListener('wheel', this.wheelFunction as any);
        this.viewport.options.canvasElement.removeEventListener('pointerdown', this.downFunction as any);
        // this.viewport.options.canvasElement.removeEventListener('globalpointermove', this.move);
        this.viewport.options.canvasElement.removeEventListener('pointermove', this.moveFunction as any);
        this.viewport.options.canvasElement.removeEventListener('pointerup', this.upFunction as any);
        // this.viewport.options.canvasElement.removeEventListener('pointerupoutside', this.up);
        this.viewport.options.canvasElement.removeEventListener('pointercancel', this.upFunction as any);
        this.viewport.options.canvasElement.removeEventListener('pointerleave', this.upFunction as any);
    }

    /**
     * handle down events for viewport
     *
     * @param {PointerEvent} event
     */
    public down(event: PointerEvent): void
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return;
        }
        if (event.pointerType === 'mouse')
        {
            this.isMouseDown = true;
        }
        else if (!this.get(event.pointerId))
        {
            this.touches.push({ id: event.pointerId, last: null });
        }
        if (this.count() === 1)
        {
            // this.last = event.global.clone();
            this.last = new Point(event.clientX, event.clientY);

            // clicked event does not fire if viewport is decelerating or bouncing
            const decelerate = this.viewport.plugins.get('decelerate', true);
            const bounce = this.viewport.plugins.get('bounce', true);

            if ((!decelerate || !decelerate.isActive()) && (!bounce || !bounce.isActive()))
            {
                this.clickedAvailable = true;
            }
            else
            {
                this.clickedAvailable = false;
            }
        }
        else
        {
            this.clickedAvailable = false;
        }

        const stop = this.viewport.plugins.down(event);

        if (stop && this.viewport.options.stopPropagation)
        {
            event.stopPropagation();
        }
    }

    /** Clears all pointer events */
    public clear(): void
    {
        this.isMouseDown = false;
        this.touches = [];
        this.last = null;
    }

    /**
     * @param {number} change
     * @returns whether change exceeds threshold
     */
    public checkThreshold(change: number): boolean
    {
        if (Math.abs(change) >= this.viewport.threshold)
        {
            return true;
        }

        return false;
    }

    /** Handle move events for viewport */
    public move(event: PointerEvent): void
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return;
        }

        const stop = this.viewport.plugins.move(event);

        if (this.clickedAvailable && this.last)
        {
            const distX = event.clientX - this.last.x;
            const distY = event.clientY - this.last.y;

            if (this.checkThreshold(distX) || this.checkThreshold(distY))
            {
                this.clickedAvailable = false;
            }
        }

        if (stop && this.viewport.options.stopPropagation)
        {
            event.stopPropagation();
        }
    }

    /** Handle up events for viewport */
    public up(event: PointerEvent): void
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return;
        }

        if (event.pointerType === 'mouse')
        {
            this.isMouseDown = false;
        }

        if (event.pointerType !== 'mouse')
        {
            this.remove(event.pointerId);
        }

        const stop = this.viewport.plugins.up(event);

        if (this.clickedAvailable && this.count() === 0 && this.last)
        {
            this.viewport.emit('clicked', {
                event: event as FederatedPointerEvent,
                screen: this.last,
                world: this.viewport.toWorld(this.last),
                viewport: this.viewport
            });
            this.clickedAvailable = false;
        }

        if (stop && this.viewport.options.stopPropagation)
        {
            event.stopPropagation();
        }
    }

    /** Gets pointer position if this.interaction is set */
    public getPointerPosition(event: WheelEvent): Point
    {
        const point = new Point();

        this.mapPositionToPoint(point, event.clientX, event.clientY);

        return point;
    }

    public mapPositionToPoint(point: IPointData, x: number, y: number): void
    {
        let rect;

        if (!this.viewport.options.canvasElement.parentElement)
        {
            rect = {
                x: 0,
                y: 0,
                width: this.viewport.options.canvasElement.width,
                height: this.viewport.options.canvasElement.height,
                left: 0,
                top: 0
            };
        }
        else
        {
            rect = this.viewport.options.canvasElement.getBoundingClientRect();
        }
        const resolutionMultiplier = 1; // this.resolution;

        point.x = (x - rect.left) * (this.viewport.options.canvasElement.width / rect.width) * resolutionMultiplier;
        point.y = (y - rect.top) * (this.viewport.options.canvasElement.height / rect.height) * resolutionMultiplier;
    }

    /** Handle wheel events */
    public handleWheel(event: WheelEvent): void
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return;
        }

        // only handle wheel events where the mouse is over the viewport
        const point = this.viewport.toLocal(this.getPointerPosition(event));

        if (this.viewport.left <= point.x
            && point.x <= this.viewport.right
            && this.viewport.top <= point.y
            && point.y <= this.viewport.bottom)
        {
            const stop = this.viewport.plugins.wheel(event);

            if (stop && !this.viewport.options.passiveWheel)
            {
                event.preventDefault();
            }
        }
    }

    public pause(): void
    {
        this.touches = [];
        this.isMouseDown = false;
    }

    /** Get touch by id */
    public get(id: number): IViewportTouch | null
    {
        for (const touch of this.touches)
        {
            if (touch.id === id)
            {
                return touch;
            }
        }

        return null;
    }

    /** Remove touch by number */
    remove(id: number): void
    {
        for (let i = 0; i < this.touches.length; i++)
        {
            if (this.touches[i].id === id)
            {
                this.touches.splice(i, 1);

                return;
            }
        }
    }

    /**
     * @returns {number} count of mouse/touch pointers that are down on the viewport
     */
    count(): number
    {
        return (this.isMouseDown ? 1 : 0) + this.touches.length;
    }
}
